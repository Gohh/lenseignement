import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
before(async () => {
  ctx = await createTestApp();
});
after(async () => {
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

test('évaluation : créée par l’enseignant, notée dans le carnet, l’élève voit sa note', async () => {
  const input = { title: 'Contrôle de calcul', heldOn: '2026-10-20', maxScore: 20, coefficient: 2 };
  await call(SUB.awa, 'post', `/cohorts/${ID.cohortCp1A}/evaluations`, 404, input);
  await call(SUB.aminata, 'post', `/cohorts/${ID.cohortCp1A}/evaluations`, 404, input);
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/evaluations`, 400, {
    ...input,
    heldOn: 'demain',
  });
  const { id } = (
    await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/evaluations`, 201, input)
  ).body;

  // L'élève la voit, sans note pour l'instant ; une autre classe ne la voit pas.
  const before = (await call(SUB.awa, 'get', '/me/evaluations', 200)).body.items.find(
    (e: { id: string }) => e.id === id,
  );
  assert.equal(before.myScore, null);
  assert.equal(before.canManage, false);
  const other = (await call(SUB.aminata, 'get', '/me/evaluations', 200)).body.items;
  assert.ok(!other.some((e: { id: string }) => e.id === id));

  // Le carnet n'est ouvert qu'à l'enseignant.
  await call(SUB.awa, 'get', `/evaluations/${id}/sheet`, 404);
  const sheet = (await call(SUB.koffi, 'get', `/evaluations/${id}/sheet`, 200)).body;
  const awa = sheet.rows[0];
  assert.ok(awa.learnerId);

  // Notes refusées : au-dessus du maximum, hors quarts de point, élève d'une autre classe.
  await call(SUB.koffi, 'put', `/evaluations/${id}/scores`, 400, {
    scores: [{ learnerId: awa.learnerId, score: 21 }],
  });
  await call(SUB.koffi, 'put', `/evaluations/${id}/scores`, 400, {
    scores: [{ learnerId: awa.learnerId, score: 12.3 }],
  });
  await call(SUB.awa, 'put', `/evaluations/${id}/scores`, 404, {
    scores: [{ learnerId: awa.learnerId, score: 10 }],
  });
  await call(SUB.koffi, 'put', `/evaluations/${id}/scores`, 200, {
    scores: [{ learnerId: awa.learnerId, score: 14.5, comment: 'Bon travail' }],
  });

  const after = (await call(SUB.awa, 'get', '/me/evaluations', 200)).body.items.find(
    (e: { id: string }) => e.id === id,
  );
  assert.equal(after.myScore, 14.5);
  assert.equal(after.myComment, 'Bon travail');
  assert.equal(after.classAverage, 14.5);

  // Une note vide efface la note.
  await call(SUB.koffi, 'put', `/evaluations/${id}/scores`, 200, {
    scores: [{ learnerId: awa.learnerId, score: null }],
  });
  const cleared = (await call(SUB.awa, 'get', '/me/evaluations', 200)).body.items.find(
    (e: { id: string }) => e.id === id,
  );
  assert.equal(cleared.myScore, null);

  await call(SUB.awa, 'delete', `/evaluations/${id}`, 404);
  await call(SUB.koffi, 'delete', `/evaluations/${id}`, 200);
});
