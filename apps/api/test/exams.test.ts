import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { isNotNull, like } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { assignments, exams, exercises } from '../src/db/schema.js';
import { splitByShares } from '../src/exams/exams.js';
import { createTestApp, type TestContext } from './helpers.js';

// Épreuves type PASEC/TIMSS/ENIA (étape 4a) : composer depuis la banque publiée selon les parts,
// ajuster, donner à une classe, puis lire les résultats par domaine.

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.db.delete(assignments).where(isNotNull(assignments.examId));
  await ctx.db.delete(exams).where(like(exams.title, '%(test épreuve)%'));
  await ctx.db.delete(exercises).where(like(exercises.title, '%(test épreuve)%'));
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

async function competency() {
  return (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body.items[0];
}

/** Vrai/faux écrit par l'enseignant et publié par la direction. */
async function published(title: string, domain: string, difficulty: string): Promise<string> {
  const comp = await competency();
  const fiche = { competencyId: comp.id, domain, difficulty, skill: 'appliquer' };
  const { id } = (
    await call(SUB.koffi, 'post', '/authoring/exercises', 201, {
      ...fiche,
      organizationId: ID.orgManguiers,
      kind: 'truefalse',
      title,
    })
  ).body;
  await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 200, {
    ...fiche,
    title,
    content: { kind: 'truefalse', explanation: '', media: null, prompt: title, correct: true },
  });
  await call(SUB.koffi, 'post', `/authoring/exercises/${id}/submit`, 204);
  await call(SUB.bamba, 'post', `/authoring/exercises/${id}/publish`, 204);
  return id;
}

test('répartition des questions par le plus fort reste', () => {
  assert.deepEqual(
    splitByShares(
      { 'nombres-operations': 48, 'grandeurs-mesures': 35, 'geometrie-espace': 17 },
      20,
    ),
    { 'nombres-operations': 10, 'grandeurs-mesures': 7, 'geometrie-espace': 3 },
  );
  assert.deepEqual(splitByShares({ donnees: 30, sciences: 30 }, 5), { donnees: 3, sciences: 2 });
  assert.deepEqual(splitByShares({}, 10), {});
});

test('épreuve : composée depuis la banque, donnée à une classe, lue par domaine', async () => {
  const geo = [
    await published('Angle droit (test épreuve)', 'geometrie-espace', 'difficile'),
    await published('Le carré (test épreuve)', 'geometrie-espace', 'facile'),
    await published('Le cube (test épreuve)', 'geometrie-espace', 'moyen'),
  ];
  const data = [
    await published('Lire un tableau (test épreuve)', 'donnees', 'facile'),
    await published('Lire un graphique (test épreuve)', 'donnees', 'moyen'),
  ];
  const comp = await competency();
  const input = {
    organizationId: ID.orgManguiers,
    curriculumVersionId: comp.curriculumId,
    model: 'libre',
    title: 'Géométrie et données (test épreuve)',
    shares: { 'geometrie-espace': 60, donnees: 40 },
    questionCount: 5,
    durationMinutes: 30,
    threshold: 50,
  };

  // Un élève ne compose pas d'épreuve et n'en voit aucune.
  await call(SUB.awa, 'post', '/authoring/exams', 403, input);
  assert.equal((await call(SUB.awa, 'get', '/authoring/exams', 200)).body.items.length, 0);
  // Parts au-delà de 100 % : refusé.
  await call(SUB.koffi, 'post', '/authoring/exams', 400, {
    ...input,
    shares: { 'geometrie-espace': 70, donnees: 40 },
  });

  const { id } = (await call(SUB.koffi, 'post', '/authoring/exams', 201, input)).body;
  let exam = (await call(SUB.koffi, 'get', `/authoring/exams/${id}`, 200)).body;
  assert.deepEqual(
    exam.plan.map((p: { domain: string; target: number; chosen: number }) => [
      p.domain,
      p.target,
      p.chosen,
    ]),
    [
      ['geometrie-espace', 3, 3],
      ['donnees', 2, 2],
    ],
  );
  // Rangées par domaine, puis de la plus facile à la plus difficile.
  assert.deepEqual(
    exam.items.map((i: { exerciseId: string }) => i.exerciseId),
    [geo[1], geo[2], geo[0], data[0], data[1]],
  );
  assert.equal(exam.canEdit, true);
  assert.equal(exam.locked, false);
  await call(SUB.awa, 'get', `/authoring/exams/${id}`, 404);

  // Pas d'autre exercice de données dans la banque : pas de remplacement possible.
  await call(SUB.koffi, 'post', `/authoring/exams/${id}/items/${data[0]}/replace`, 400);
  await call(SUB.koffi, 'delete', `/authoring/exams/${id}/items/${data[0]}`, 204);
  exam = (await call(SUB.koffi, 'get', `/authoring/exams/${id}`, 200)).body;
  assert.equal(exam.items.length, 4);
  await call(SUB.koffi, 'post', `/authoring/exams/${id}/assemble`, 204);
  exam = (await call(SUB.koffi, 'get', `/authoring/exams/${id}`, 200)).body;
  assert.equal(exam.items.length, 5);

  // Donnée à la classe : un devoir noté sur 100, fait des mêmes questions.
  const gift = (
    await call(SUB.koffi, 'post', `/authoring/exams/${id}/give`, 200, {
      cohortIds: [ID.cohortCp1A],
    })
  ).body;
  assert.deepEqual(gift, { given: 1, skipped: 0 });
  const again = (
    await call(SUB.koffi, 'post', `/authoring/exams/${id}/give`, 200, {
      cohortIds: [ID.cohortCp1A],
    })
  ).body;
  assert.deepEqual(again, { given: 0, skipped: 1 });
  exam = (await call(SUB.koffi, 'get', `/authoring/exams/${id}`, 200)).body;
  assert.equal(exam.locked, true);
  assert.equal(exam.given.length, 1);
  const assignmentId = exam.given[0].assignmentId;

  // Donnée : les questions ne changent plus, et elle ne se supprime pas.
  await call(SUB.koffi, 'post', `/authoring/exams/${id}/assemble`, 409);
  await call(SUB.koffi, 'post', `/authoring/exams/${id}/items/${geo[0]}/replace`, 409);
  await call(SUB.koffi, 'delete', `/authoring/exams/${id}`, 409);
  await call(SUB.koffi, 'put', `/authoring/exams/${id}`, 204, {
    title: input.title,
    durationMinutes: 40,
    threshold: 60,
  });

  // L'élève la fait comme un devoir.
  const work = (await call(SUB.awa, 'get', `/assignments/${assignmentId}/work`, 200)).body;
  assert.equal(work.assignment.maxScore, 100);
  assert.equal(work.exercises.length, 5);
  const answers = [
    { choices: [0] },
    { choices: [0] },
    { choices: [1] },
    { choices: [1] },
    { choices: [1] },
  ];
  const mine = (
    await call(SUB.awa, 'post', `/assignments/${assignmentId}/answers`, 200, {
      attemptId: randomUUID(),
      answers,
    })
  ).body;

  const results = (await call(SUB.koffi, 'get', `/authoring/exams/${id}/results`, 200)).body;
  assert.equal(results.participants, 1);
  assert.ok(results.expected >= 1);
  assert.equal(results.average, mine.score);
  assert.equal(results.exam.threshold, 60);
  assert.deepEqual(
    results.byDomain.map((d: { key: string; count: number }) => [d.key, d.count]),
    [
      ['geometrie-espace', 3],
      ['donnees', 2],
    ],
  );
  assert.equal(results.byQuestion.length, 5);
  assert.equal(results.aboveThreshold + results.below.length, 1);
  const filtered = (
    await call(SUB.koffi, 'get', `/authoring/exams/${id}/results?cohort=${ID.cohortCp1A}`, 200)
  ).body;
  assert.equal(filtered.cohortId, ID.cohortCp1A);
  await call(SUB.awa, 'get', `/authoring/exams/${id}/results`, 404);

  // Une épreuve jamais donnée se supprime.
  const other = (
    await call(SUB.koffi, 'post', '/authoring/exams', 201, {
      ...input,
      title: 'À jeter (test épreuve)',
    })
  ).body;
  await call(SUB.koffi, 'delete', `/authoring/exams/${other.id}`, 204);
  await call(SUB.koffi, 'get', `/authoring/exams/${other.id}`, 404);
});
