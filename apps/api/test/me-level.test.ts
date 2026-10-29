import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

test('la personne choisit son propre niveau ; un code inconnu est refusé', async () => {
  const token = await ctx.sign({ sub: SUB.yao });
  const api = () => request(ctx.app.getHttpServer());
  const put = (body: object) =>
    api().put('/api/v1/me/level').set('authorization', `Bearer ${token}`).send(body);

  await put({ level: 'cm9' }).expect(400);
  await put({ level: 'cm1' }).expect(200);
  const me = await api().get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(200);
  assert.equal(me.body.level, 'cm1');

  await put({ level: null }).expect(200);
  const cleared = await api().get('/api/v1/me').set('authorization', `Bearer ${token}`);
  assert.equal(cleared.body.level, null);
  await api().put('/api/v1/me/level').send({ level: 'cm1' }).expect(401);
});
