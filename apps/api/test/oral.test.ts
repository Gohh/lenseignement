import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { and, eq, inArray, like } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships, oralBenchmarks, oralResults, oralTests } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

// Évaluations orales chronométrées (étape 5a) : rédiger depuis un modèle, publier, faire passer
// dans sa classe, scores calculés par la plateforme, repères du superadministrateur.

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
  await ctx.db
    .insert(memberships)
    .values([{ userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' }]);
});

after(async () => {
  const tests = ctx.db
    .select({ id: oralTests.id })
    .from(oralTests)
    .where(like(oralTests.title, '%(test oral)%'));
  await ctx.db.delete(oralResults).where(inArray(oralResults.testId, tests));
  await ctx.db.delete(oralTests).where(like(oralTests.title, '%(test oral)%'));
  await ctx.db.delete(oralBenchmarks);
  await ctx.db
    .delete(memberships)
    .where(and(eq(memberships.userId, ID.userYao), eq(memberships.role, 'superadministrateur')));
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

const answer = (over: object = {}) => ({
  errors: [],
  last: null,
  seconds: 0,
  stopped: false,
  answers: [],
  ...over,
});

test('rédiger, publier, faire passer, résultats de la classe et repères', async () => {
  const base = {
    organizationId: ID.orgManguiers,
    title: 'Lecture CP1 (test oral)',
    subject: 'lecture',
    level: 'cp1',
  };
  const { id } = (
    await call(SUB.koffi, 'post', '/oral/tests', 201, { ...base, model: 'lecture-debut' })
  ).body;
  const draft = (await call(SUB.koffi, 'get', `/oral/tests/${id}`, 200)).body;
  assert.equal(draft.status, 'brouillon');
  assert.deepEqual(
    draft.parts.map((p: { kind: string }) => p.kind),
    ['grille', 'grille', 'grille', 'texte'],
  );
  assert.equal(draft.parts[3].reference, true);
  assert.equal(draft.canEdit, true);
  assert.equal(draft.canPublish, false);

  // Un texte trop court est refusé.
  const parts = draft.parts;
  await call(SUB.koffi, 'put', `/oral/tests/${id}`, 400, {
    ...base,
    parts: [...parts.slice(0, 3), { ...parts[3], text: 'Trop court.' }],
  });
  await call(SUB.koffi, 'put', `/oral/tests/${id}`, 204, { ...base, parts });

  // L'élève ne voit pas les brouillons ; l'enseignant ne publie pas, la direction oui.
  await call(SUB.awa, 'get', `/oral/tests/${id}`, 404);
  await call(SUB.koffi, 'get', `/oral/sheet?test=${id}&cohort=${ID.cohortCp1A}`, 409);
  await call(SUB.koffi, 'post', `/oral/tests/${id}/publish`, 403);
  await call(SUB.bamba, 'post', `/oral/tests/${id}/publish`, 204);
  await call(SUB.koffi, 'put', `/oral/tests/${id}`, 409, { ...base, parts });

  // Feuille de passation : seulement dans ses classes.
  await call(SUB.aminata, 'get', `/oral/sheet?test=${id}&cohort=${ID.cohortCp1A}`, 404);
  const sheet = (
    await call(SUB.koffi, 'get', `/oral/sheet?test=${id}&cohort=${ID.cohortCp1A}`, 200)
  ).body;
  assert.equal(sheet.learners.length, 3);
  assert.ok(sheet.learners.every((l: { done: boolean }) => !l.done));

  const operationId = randomUUID();
  const result = {
    operationId,
    testId: id,
    cohortId: ID.cohortCp1A,
    learnerId: ID.userAwa,
    parts: [
      answer({ errors: [1, 2, 40], last: 29, seconds: 60 }),
      // Tout faux sur les 10 premiers : la règle d'arrêt compte 0.
      answer({ errors: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], last: 9, seconds: 20 }),
      answer(),
      answer({ last: 19, seconds: 30, answers: [1, 1, 0, null] }),
    ],
  };
  await call(SUB.koffi, 'post', '/oral/results', 400, {
    ...result,
    parts: result.parts.slice(0, 2),
  });
  await call(SUB.koffi, 'post', '/oral/results', 400, {
    ...result,
    operationId: randomUUID(),
    learnerId: ID.learnerMoussa,
  });
  const saved = (await call(SUB.koffi, 'post', '/oral/results', 200, result)).body;
  assert.deepEqual(
    saved.scores.map((s: { correct: number; perMinute: number | null }) => [
      s.correct,
      s.perMinute,
    ]),
    [
      [28, 28],
      [0, 0],
      [0, 0],
      [20, 40],
    ],
  );
  assert.equal(saved.scores[1].stopped, true);
  assert.equal(saved.scores[3].questionsCorrect, 2);
  // Renvoyé (hors ligne) : compté une fois.
  const again = (await call(SUB.koffi, 'post', '/oral/results', 200, result)).body;
  assert.equal(again.id, saved.id);
  const count = await ctx.db.select().from(oralResults).where(eq(oralResults.testId, id));
  assert.equal(count.length, 1);

  // Sans repère, pas de « repère atteint ».
  let results = (
    await call(SUB.koffi, 'get', `/oral/results?test=${id}&cohort=${ID.cohortCp1A}`, 200)
  ).body;
  assert.equal(results.evaluated, 1);
  assert.equal(results.median, 40);
  assert.equal(results.benchmarkRate, null);
  assert.equal(results.learners.length, 3);

  // Repères : seulement le superadministrateur.
  const benchmarks = { items: [{ level: 'cp1', subject: 'lecture', perMinute: 40, questions: 3 }] };
  await call(SUB.koffi, 'put', '/oral/benchmarks', 403, benchmarks);
  await call(SUB.yao, 'put', '/oral/benchmarks', 200, benchmarks);
  results = (await call(SUB.koffi, 'get', `/oral/results?test=${id}&cohort=${ID.cohortCp1A}`, 200))
    .body;
  assert.equal(results.benchmark.perMinute, 40);
  // 40 par minute mais 2 questions justes sur 3 demandées : pas encore.
  assert.equal(results.benchmarkRate, 0);
  assert.equal(results.bands.find((b: { key: string }) => b.key === 'progres').count, 1);

  // Page d'ensemble et menu.
  const overview = (await call(SUB.koffi, 'get', '/oral', 200)).body;
  assert.ok(
    overview.classes.some(
      (c: { id: string; visit: boolean }) => c.id === ID.cohortCp1A && !c.visit,
    ),
  );
  assert.ok(overview.done.some((d: { testId: string }) => d.testId === id));
  assert.equal((await call(SUB.koffi, 'get', '/me', 200)).body.oral, true);

  // Publiée : on ne la supprime plus, on en fait une copie modifiable.
  await call(SUB.koffi, 'delete', `/oral/tests/${id}`, 403);
  const copy = (await call(SUB.koffi, 'post', `/oral/tests/${id}/copy`, 201)).body;
  const copied = (await call(SUB.koffi, 'get', `/oral/tests/${copy.id}`, 200)).body;
  assert.equal(copied.status, 'brouillon');
  await call(SUB.koffi, 'delete', `/oral/tests/${copy.id}`, 204);
});
