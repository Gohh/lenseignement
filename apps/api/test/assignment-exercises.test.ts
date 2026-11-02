import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { inArray, like } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { assignments, exercises } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
const madeAssignments: string[] = [];

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  if (madeAssignments.length > 0) {
    await ctx.db.delete(assignments).where(inArray(assignments.id, madeAssignments));
  }
  await ctx.db.delete(exercises).where(like(exercises.title, '%(test devoir)%'));
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

/** Exercice écrit par l'enseignant et publié par la direction. */
async function published(title: string, kind: string, content: object): Promise<string> {
  const comps = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body;
  const fiche = {
    competencyId: comps.items[0].id,
    domain: 'nombres-operations',
    difficulty: 'facile',
    skill: 'appliquer',
  };
  const { id } = (
    await call(SUB.koffi, 'post', '/authoring/exercises', 201, {
      ...fiche,
      organizationId: ID.orgManguiers,
      kind,
      title,
    })
  ).body;
  await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 200, {
    ...fiche,
    title,
    content: { kind, explanation: '', media: null, ...content },
  });
  await call(SUB.koffi, 'post', `/authoring/exercises/${id}/submit`, 204);
  await call(SUB.bamba, 'post', `/authoring/exercises/${id}/publish`, 204);
  return id;
}

test('devoir fait d’exercices de la Fabrique : corrigé et noté par la plateforme', async () => {
  const calc = await published('Partager 12 mangues (test devoir)', 'number', {
    prompt: '12 mangues pour 3 enfants : combien chacun ?',
    answer: 4,
    tolerance: 0,
    unit: '',
  });
  const vrai = await published('Le carré (test devoir)', 'truefalse', {
    prompt: 'Un carré a quatre côtés égaux.',
    correct: true,
  });

  const { id } = (
    await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/assignments`, 201, {
      title: 'Exercices du lundi',
      instructions: 'Fais les deux exercices.',
      maxScore: 20,
    })
  ).body;
  madeAssignments.push(id);

  // Banque : seulement les exercices publiés, et l'élève n'y a pas accès.
  const found = (
    await call(SUB.koffi, 'get', `/assignments/${id}/exercise-candidates?q=test%20devoir`, 200)
  ).body.items.map((e: { id: string }) => e.id);
  assert.ok(found.includes(calc) && found.includes(vrai));
  await call(SUB.awa, 'get', `/assignments/${id}/exercise-candidates`, 404);
  await call(SUB.awa, 'post', `/assignments/${id}/exercises`, 404, { exerciseId: calc });

  await call(SUB.koffi, 'post', `/assignments/${id}/exercises`, 200, { exerciseId: calc });
  await call(SUB.koffi, 'post', `/assignments/${id}/exercises`, 200, { exerciseId: vrai });
  const review = (await call(SUB.koffi, 'get', `/assignments/${id}/review`, 200)).body;
  assert.deepEqual(
    review.exercises.map((e: { id: string }) => e.id),
    [calc, vrai],
  );
  assert.equal(review.exercisesLocked, false);

  // L'élève reçoit les exercices sans corrigé, et ne peut pas rendre un texte à la place.
  const work = (await call(SUB.awa, 'get', `/assignments/${id}/work`, 200)).body;
  assert.equal(work.assignment.exerciseCount, 2);
  assert.equal(work.exercises[0].play.answer, undefined);
  assert.equal(work.exercises[1].play.correct, undefined);
  await call(SUB.awa, 'post', `/assignments/${id}/submission`, 400, { body: 'Fini.' });
  await call(SUB.fatou, 'get', `/assignments/${id}/work`, 404);

  // Toutes les réponses sont attendues ; puis la plateforme corrige : 1 sur 2 → 10 sur 20.
  const attemptId = randomUUID();
  await call(SUB.awa, 'post', `/assignments/${id}/answers`, 400, {
    attemptId,
    answers: [{ texts: ['4'] }],
  });
  const answers = [{ texts: ['4'] }, { choices: [1] }];
  const mine = (
    await call(SUB.awa, 'post', `/assignments/${id}/answers`, 200, { attemptId, answers })
  ).body;
  assert.equal(mine.score, 10);
  assert.equal(mine.body, 'Exercices réussis : 1 sur 2.');
  assert.deepEqual(
    mine.results.map((r: { correct: boolean }) => r.correct),
    [true, false],
  );

  // Renvoi du même envoi (hors ligne) : même copie ; un second envoi est refusé.
  const again = (
    await call(SUB.awa, 'post', `/assignments/${id}/answers`, 200, { attemptId, answers })
  ).body;
  assert.equal(again.id, mine.id);
  await call(SUB.awa, 'post', `/assignments/${id}/answers`, 400, {
    attemptId: randomUUID(),
    answers: [{ texts: ['4'] }, { choices: [0] }],
  });

  // L'enseignant voit la copie corrigée ; les exercices ne changent plus.
  const after = (await call(SUB.koffi, 'get', `/assignments/${id}/review`, 200)).body;
  assert.equal(after.exercisesLocked, true);
  assert.equal(after.assignment.gradedCount, 1);
  await call(SUB.koffi, 'delete', `/assignments/${id}/exercises/${vrai}`, 400);
  const awaItem = (await call(SUB.awa, 'get', '/me/assignments', 200)).body.items.find(
    (a: { id: string }) => a.id === id,
  );
  assert.equal(awaItem.mine.results.length, 2);
});
