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

test('l’enseignant ajoute une ressource, sa classe la voit, pas les autres', async () => {
  const input = {
    title: 'Les fractions en vidéo',
    url: 'https://exemple.org/fractions',
    kind: 'video',
  };
  await call(SUB.awa, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 404, input);
  await call(SUB.aminata, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 404, input);
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 400, {
    ...input,
    url: 'javascript:alert(1)',
  });
  const { id } = (await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/resources`, 201, input))
    .body;

  const awa = (await call(SUB.awa, 'get', '/me/resources', 200)).body.items;
  const seen = awa.find((r: { id: string }) => r.id === id);
  assert.equal(seen.title, input.title);
  assert.equal(seen.canManage, false);
  const other = (await call(SUB.aminata, 'get', '/me/resources', 200)).body.items;
  assert.ok(!other.some((r: { id: string }) => r.id === id));

  await call(SUB.awa, 'delete', `/resources/${id}`, 404);
  await call(SUB.koffi, 'delete', `/resources/${id}`, 200);
  const after = (await call(SUB.awa, 'get', '/me/resources', 200)).body.items;
  assert.ok(!after.some((r: { id: string }) => r.id === id));
});
