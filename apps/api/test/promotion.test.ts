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
  method: 'get' | 'post' | 'put',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('l’enfant d’un parent passe au niveau suivant sur décision du parent seulement', async () => {
  const child = (
    await call(SUB.fatou, 'post', '/family/children', 201, {
      displayName: 'Passage (fictif)',
      level: 'cm2',
    })
  ).body;
  const base = `/learners/${child.id}/promotion`;

  const view = (await call(SUB.fatou, 'get', base, 200)).body;
  assert.deepEqual(
    { level: view.level, next: view.nextLevel, canDecide: view.canDecide },
    { level: 'cm2', next: '6e', canDecide: true },
  );

  // Ni une personne étrangère ni un répétiteur ne décident.
  await call(SUB.yao, 'post', `${base}/approve`, 403);
  await call(SUB.fatou, 'post', `${base}/decline`, 404);
  const approved = await call(SUB.fatou, 'post', `${base}/approve`, 201);
  assert.equal(approved.body.level, '6e');
  assert.equal((await call(SUB.fatou, 'get', base, 200)).body.level, '6e');
});

test('l’apprenant demande le niveau supérieur ; avec un parent ou une classe, il attend', async () => {
  // Awa est dans une classe : sa demande attend la validation.
  await call(SUB.awa, 'put', '/me/level', 200, { level: '6e' });
  const requested = await call(SUB.awa, 'post', '/me/level-request', 201);
  assert.deepEqual(requested.body, { status: 'pending', level: '5e' });
  const mine = (await call(SUB.awa, 'get', '/me/promotion', 200)).body;
  assert.equal(mine.pending, true);
  assert.equal(mine.canDecide, false);

  // Elle ne se valide pas elle-même.
  await call(SUB.awa, 'post', `/learners/${ID.userAwa}/promotion/approve`, 403);
  // Sa mère (lien vérifié) refuse, puis l'enseignant de sa classe accepte une nouvelle demande.
  await call(SUB.fatou, 'post', `/learners/${ID.userAwa}/promotion/decline`, 201);
  assert.equal((await call(SUB.awa, 'get', '/me/promotion', 200)).body.pending, false);
  await call(SUB.awa, 'post', '/me/level-request', 201);
  await call(SUB.koffi, 'post', `/learners/${ID.userAwa}/promotion/approve`, 201);
  assert.equal((await call(SUB.awa, 'get', '/me/promotion', 200)).body.level, '5e');
  await call(SUB.awa, 'put', '/me/level', 200, { level: null });
});

test('un apprenant autonome passe directement ; sans niveau suivant, la demande est refusée', async () => {
  await call(SUB.yao, 'put', '/me/level', 200, { level: '3e' });
  const direct = await call(SUB.yao, 'post', '/me/level-request', 201);
  assert.deepEqual(direct.body, { status: 'applied', level: '2nde' });
  await call(SUB.yao, 'put', '/me/level', 200, { level: 'tle' });
  await call(SUB.yao, 'post', '/me/level-request', 400);
  await call(SUB.yao, 'put', '/me/level', 200, { level: null });
  await call(SUB.yao, 'post', '/me/level-request', 400);
});
