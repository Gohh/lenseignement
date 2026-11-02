import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, inArray, like, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { exerciseMedia, exercises } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

let dir: string;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'exercices-'));
  process.env.EXERCISE_MEDIA_DIR = dir;
  ctx = await createTestApp();
});

after(async () => {
  const rows = await ctx.db
    .select({ id: exercises.id })
    .from(exercises)
    .where(like(exercises.title, '%(test API)%'));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await ctx.db.update(exercises).set({ replacesId: null }).where(inArray(exercises.id, ids));
    await ctx.db.delete(exercises).where(inArray(exercises.id, ids));
  }
  await ctx.db.delete(exerciseMedia).where(eq(exerciseMedia.organizationId, ID.orgManguiers));
  await ctx.close();
  await rm(dir, { recursive: true, force: true });
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  status: number,
  body?: object | Buffer,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  let req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  if (Buffer.isBuffer(body)) req = req.set('content-type', 'application/octet-stream');
  return (body ? req.send(body) : req).expect(status);
}

// PNG 1×1 transparent.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test('circuit d’un exercice : création, rédaction, relecture, publication, nouvelle version', async () => {
  const comps = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body
    .items as Array<{ id: string; code: string }>;
  assert.ok(comps.length > 0, 'une compétence publiée existe');
  const competencyId = comps[0]!.id;

  // Un élève ne rédige pas.
  assert.deepEqual((await call(SUB.awa, 'get', '/authoring/exercises/organizations', 200)).body, {
    items: [],
  });
  const fiche = {
    organizationId: ID.orgManguiers,
    competencyId,
    domain: 'nombres-operations',
    difficulty: 'moyen',
    skill: 'appliquer',
    kind: 'number',
    title: 'Partager des mangues (test API)',
  };
  await call(SUB.awa, 'post', '/authoring/exercises', 403, fiche);
  const { id } = (await call(SUB.koffi, 'post', '/authoring/exercises', 201, fiche)).body;

  // La consigne de départ ne part pas en relecture.
  await call(SUB.koffi, 'post', `/authoring/exercises/${id}/submit`, 400);

  const content = {
    kind: 'number',
    prompt: 'Awa partage 24 mangues entre 4 enfants. Combien chacun en reçoit-il ?',
    explanation: '24 divisé par 4 font 6.',
    media: null,
    answer: 6,
    tolerance: 0,
    unit: 'mangues',
  };
  const update = {
    title: fiche.title,
    competencyId,
    domain: fiche.domain,
    difficulty: fiche.difficulty,
    skill: fiche.skill,
    content,
  };
  // Le type ne change pas.
  await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 400, {
    ...update,
    content: { kind: 'truefalse', prompt: 'x', explanation: '', media: null, correct: true },
  });
  const saved = (await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 200, update)).body;
  assert.equal(saved.play.kind, 'number');
  assert.equal(saved.play.answer, undefined, 'le corrigé n’est pas dans la version élève');

  // Image : le vrai type du fichier est vérifié.
  await call(
    SUB.koffi,
    'post',
    `/authoring/exercises/${id}/media`,
    400,
    Buffer.from('pas une image'),
  );
  const media = (await call(SUB.koffi, 'post', `/authoring/exercises/${id}/media`, 201, PNG)).body;
  assert.equal(media.type, 'image');
  await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 200, {
    ...update,
    content: { ...content, media: { ...media, alt: 'Des mangues' } },
  });
  const file = await request(ctx.app.getHttpServer())
    .get(`/api/v1/exercise-media/${media.key}`)
    .expect(200);
  assert.equal(file.headers['content-type'], 'image/png');

  // Aperçu : corrigé par le serveur, nombre écrit à la française.
  const good = (
    await call(SUB.koffi, 'post', `/authoring/exercises/${id}/check`, 200, { texts: ['6,0'] })
  ).body;
  assert.equal(good.correct, true);
  const bad = (
    await call(SUB.koffi, 'post', `/authoring/exercises/${id}/check`, 200, { texts: ['5'] })
  ).body;
  assert.equal(bad.correct, false);
  assert.equal(bad.score, 0);

  // Relecture : l'auteur ne se publie pas ; la direction renvoie, puis publie.
  await call(SUB.koffi, 'post', `/authoring/exercises/${id}/submit`, 204);
  await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 409, update);
  await call(SUB.koffi, 'post', `/authoring/exercises/${id}/publish`, 403);
  const queue = (await call(SUB.bamba, 'get', '/authoring/exercises?status=review', 200)).body;
  const inQueue = queue.items.find((e: { id: string }) => e.id === id);
  assert.equal(inQueue.canPublish, true);
  assert.ok(queue.byDomain['nombres-operations'] >= 1);
  await call(SUB.bamba, 'post', `/authoring/exercises/${id}/return`, 204, {
    note: 'Précise que le partage est égal.',
  });
  const back = (await call(SUB.koffi, 'get', `/authoring/exercises/${id}`, 200)).body;
  assert.equal(back.status, 'draft');
  assert.equal(back.reviewNote, 'Précise que le partage est égal.');
  await call(SUB.koffi, 'post', `/authoring/exercises/${id}/submit`, 204);
  await call(SUB.bamba, 'post', `/authoring/exercises/${id}/publish`, 204);

  // Publié : figé, même par la base.
  await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 409, update);
  await assert.rejects(
    ctx.db.execute(sql`update exercises set title = 'x' where id = ${id}`),
    (e: Error & { cause?: Error }) => /figé/.test(e.cause?.message ?? e.message),
  );

  // « Modifier » ouvre un brouillon qui remplace l'exercice publié une fois relu.
  const v2 = (await call(SUB.koffi, 'post', `/authoring/exercises/${id}/copy`, 201, {})).body.id;
  assert.notEqual(v2, id);
  assert.equal(
    (await call(SUB.koffi, 'post', `/authoring/exercises/${id}/copy`, 201, {})).body.id,
    v2,
    'un seul brouillon à la fois',
  );
  assert.equal((await call(SUB.koffi, 'get', `/authoring/exercises/${id}`, 200)).body.draftId, v2);
  await call(SUB.koffi, 'put', `/authoring/exercises/${v2}`, 200, {
    ...update,
    content: { ...content, prompt: 'Awa partage également 24 mangues entre 4 enfants. Combien ?' },
  });
  await call(SUB.koffi, 'post', `/authoring/exercises/${v2}/submit`, 204);
  await call(SUB.bamba, 'post', `/authoring/exercises/${v2}/publish`, 204);
  assert.equal(
    (await call(SUB.koffi, 'get', `/authoring/exercises/${id}`, 200)).body.status,
    'archived',
  );
  assert.equal(
    (await call(SUB.koffi, 'get', `/authoring/exercises/${v2}`, 200)).body.status,
    'published',
  );
});

test('chaque type d’exercice est corrigé par la plateforme', async () => {
  const comps = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body.items;
  const competencyId = comps[0].id as string;
  const make = async (kind: string, content: object) => {
    const { id } = (
      await call(SUB.koffi, 'post', '/authoring/exercises', 201, {
        organizationId: ID.orgManguiers,
        competencyId,
        domain: 'comprehension-ecrit',
        difficulty: 'facile',
        skill: 'connaitre',
        kind,
        title: `Type ${kind} (test API)`,
      })
    ).body;
    const detail = (
      await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 200, {
        title: `Type ${kind} (test API)`,
        competencyId,
        domain: 'comprehension-ecrit',
        difficulty: 'facile',
        skill: 'connaitre',
        content: { kind, explanation: '', media: null, ...content },
      })
    ).body;
    const check = async (answer: object) =>
      (await call(SUB.koffi, 'post', `/authoring/exercises/${id}/check`, 200, answer)).body;
    return { detail, check };
  };

  const gaps = await make('gaps', {
    prompt: 'Complète.',
    text: 'Le [[chat]] a [[4|quatre]] pattes.',
  });
  assert.deepEqual(gaps.detail.play.parts, ['Le ', ' a ', ' pattes.']);
  assert.equal((await gaps.check({ texts: ['Chat', 'quatre'] })).correct, true);
  assert.equal((await gaps.check({ texts: ['chien', '4'] })).score, 0.5);

  const order = await make('order', {
    prompt: 'Range du plus petit au plus grand.',
    items: ['2', '5', '9'],
  });
  const shown = order.detail.play.items as string[];
  assert.notDeepEqual(shown, ['2', '5', '9']);
  const right = ['2', '5', '9'].map((v) => shown.indexOf(v));
  assert.equal((await order.check({ choices: right })).correct, true);

  const match = await make('match', {
    prompt: 'Relie.',
    pairs: [
      { left: 'Chien', right: 'aboie' },
      { left: 'Chat', right: 'miaule' },
      { left: 'Vache', right: 'meugle' },
    ],
  });
  const rights = match.detail.play.rights as string[];
  const picks = ['aboie', 'miaule', 'meugle'].map((v) => rights.indexOf(v));
  assert.equal((await match.check({ choices: picks })).correct, true);

  const reading = await make('reading', {
    prompt: 'Lis le texte puis réponds.',
    passage: 'Koffi va au marché avec sa mère. Ils achètent des ignames.',
    questions: [
      { prompt: 'Avec qui va Koffi ?', choices: ['Son père', 'Sa mère'], correct: 1 },
      { prompt: 'Qu’achètent-ils ?', choices: ['Des ignames', 'Du riz'], correct: 0 },
    ],
  });
  assert.equal(reading.detail.play.questions[0].correct, undefined);
  const half = await reading.check({ choices: [1, 1] });
  assert.equal(half.score, 0.5);
  assert.deepEqual(half.feedback, ['Question 2 : à revoir.']);

  const tf = await make('truefalse', { prompt: 'Abidjan est au bord de la mer.', correct: true });
  assert.equal((await tf.check({ choices: [0] })).correct, true);
  assert.equal((await tf.check({ choices: [1] })).correct, false);
});

test('import d’un fichier d’exercices : les valables partent en relecture', async () => {
  const comps = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body
    .items as Array<{ code: string; curriculumId: string }>;
  const { code, curriculumId } = comps[0]!;
  const good = {
    competencyCode: code.toLowerCase(),
    domain: 'nombres-operations',
    title: 'Importé (test API)',
    content: { kind: 'truefalse', prompt: 'Deux et deux font quatre.', correct: true },
  };
  const body = {
    organizationId: ID.orgManguiers,
    curriculumVersionId: curriculumId,
    items: [
      good,
      { ...good, competencyCode: 'INCONNU-99', title: 'Mauvais code (test API)' },
      { ...good, content: { kind: 'choice', prompt: 'x', choices: ['a'], correct: 0 } },
    ],
  };
  await call(SUB.awa, 'post', '/authoring/exercises/import', 403, body);
  const result = (await call(SUB.koffi, 'post', '/authoring/exercises/import', 200, body)).body;
  assert.equal(result.created, 1);
  assert.deepEqual(
    result.errors.map((e: { index: number }) => e.index),
    [2, 3],
  );
  assert.match(result.errors[0].message, /INCONNU-99/);
  assert.match(result.errors[1].message, /Au moins deux réponses/);
  const list = (await call(SUB.bamba, 'get', '/authoring/exercises?status=review', 200)).body;
  const imported = list.items.find((e: { title: string }) => e.title === 'Importé (test API)');
  assert.equal(imported.status, 'review');
  assert.equal(imported.difficulty, 'moyen');
});
