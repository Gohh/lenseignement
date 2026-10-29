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
  method: 'get' | 'post' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('devoir : donné par l’enseignant, rendu par l’élève, corrigé avec une note', async () => {
  const input = { title: 'Les fractions', instructions: 'Coupe une pizza en 4.', maxScore: 20 };

  // Seuls l'enseignant de la classe ou la direction donnent un devoir.
  await call(SUB.awa, 'post', `/cohorts/${ID.cohortCp1A}/assignments`, 404, input);
  await call(SUB.aminata, 'post', `/cohorts/${ID.cohortCp1A}/assignments`, 404, input);
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/assignments`, 400, {
    ...input,
    title: '',
  });
  const { id } = (
    await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/assignments`, 201, input)
  ).body;

  // L'élève de la classe le voit ; une autre classe, non.
  const awa = (await call(SUB.awa, 'get', '/me/assignments', 200)).body.items;
  const seen = awa.find((a: { id: string }) => a.id === id);
  assert.equal(seen.mine, null);
  assert.equal(seen.canManage, false);
  const other = (await call(SUB.aminata, 'get', '/me/assignments', 200)).body.items;
  assert.ok(!other.some((a: { id: string }) => a.id === id));

  // Il rend sa copie, puis la remplace ; un étranger à la classe ne peut pas.
  await call(SUB.awa, 'post', `/assignments/${id}/submission`, 400, { body: ' ' });
  await call(SUB.fatou, 'post', `/assignments/${id}/submission`, 404, { body: 'Moi aussi' });
  await call(SUB.awa, 'post', `/assignments/${id}/submission`, 200, { body: 'Quatre parts.' });
  await call(SUB.awa, 'post', `/assignments/${id}/submission`, 200, {
    body: 'Quatre parts égales.',
  });

  const review = (await call(SUB.koffi, 'get', `/assignments/${id}/review`, 200)).body;
  assert.equal(review.assignment.submittedCount, 1);
  const row = review.rows.find((r: { learnerId: string }) => r.learnerId === ID.userAwa);
  assert.equal(row.submission.body, 'Quatre parts égales.');
  await call(SUB.awa, 'get', `/assignments/${id}/review`, 404);

  // Correction : note entière de 0 à la note maximale, seulement par l'enseignant.
  const subId = row.submission.id;
  await call(SUB.awa, 'post', `/submissions/${subId}/grade`, 404, { score: 20 });
  await call(SUB.koffi, 'post', `/submissions/${subId}/grade`, 400, { score: 25 });
  await call(SUB.koffi, 'post', `/submissions/${subId}/grade`, 400, { score: 12.5 });
  await call(SUB.koffi, 'post', `/submissions/${subId}/grade`, 200, {
    score: 17,
    comment: 'Bien !',
  });

  const graded = (await call(SUB.awa, 'get', '/me/assignments', 200)).body.items.find(
    (a: { id: string }) => a.id === id,
  );
  assert.equal(graded.mine.score, 17);
  assert.equal(graded.mine.comment, 'Bien !');
  // Corrigé, le devoir ne se modifie plus.
  await call(SUB.awa, 'post', `/assignments/${id}/submission`, 400, { body: 'Je change.' });

  await call(SUB.awa, 'delete', `/assignments/${id}`, 404);
  await call(SUB.koffi, 'delete', `/assignments/${id}`, 200);
});
