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

test('ADR-020 : le parent ajoute un enfant et confie son suivi à un répétiteur, en lecture seule', async () => {
  // Le parent ajoute son enfant : lui seul peut ouvrir sa fiche.
  await call(SUB.fatou, 'post', '/family/children', 400, { displayName: 'A' });
  const child = (
    await call(SUB.fatou, 'post', '/family/children', 201, {
      displayName: 'Awa (fictive)',
      level: 'cp2',
    })
  ).body;
  const list = (await call(SUB.fatou, 'get', '/family/children', 200)).body.items;
  const mine = list.find((c: { id: string }) => c.id === child.id);
  assert.equal(mine.displayName, 'Awa (fictive)');
  assert.equal(mine.level, 'cp2');
  await call(SUB.fatou, 'get', `/learners/${child.id}`, 200);
  await call(SUB.yao, 'get', `/learners/${child.id}`, 403);

  // On ne confie pas l'enfant d'un autre, ni avec un mauvais code.
  await call(SUB.yao, 'post', '/family/invitations', 400, { learnerIds: [child.id] });
  await call(SUB.yao, 'post', '/family/invitations/redeem', 404, { code: 'AAAAAAAA' });

  // Invitation : un code, utilisable une seule fois, pas par le parent lui-même.
  const { code } = (
    await call(SUB.fatou, 'post', '/family/invitations', 201, { learnerIds: [child.id] })
  ).body;
  assert.match(code, /^[A-Z2-9]{8}$/);
  await call(SUB.fatou, 'post', '/family/invitations/redeem', 404, { code });
  const redeemed = await call(SUB.yao, 'post', '/family/invitations/redeem', 201, {
    code: code.toLowerCase().replace(/^(.{4})/, '$1 '),
  });
  assert.equal(redeemed.body.children, 1);
  await call(SUB.yao, 'post', '/family/invitations/redeem', 404, { code });

  // Le répétiteur lit la fiche, mais ne décide pas.
  await call(SUB.yao, 'get', `/learners/${child.id}`, 200);
  const tutored = (await call(SUB.yao, 'get', '/family/tutored', 200)).body.items;
  assert.deepEqual(
    tutored.map((c: { id: string }) => c.id),
    [child.id],
  );
  await call(SUB.yao, 'post', `/learners/${child.id}/remediation/LECTURE/override`, 403, {});

  // Le parent voit le répétiteur et peut retirer l'accès.
  const after = (await call(SUB.fatou, 'get', '/family/children', 200)).body.items.find(
    (c: { id: string }) => c.id === child.id,
  );
  assert.equal(after.tutors.length, 1);
  await call(SUB.yao, 'delete', `/family/tutors/${after.tutors[0].linkId}`, 404);
  await call(SUB.fatou, 'delete', `/family/tutors/${after.tutors[0].linkId}`, 200);
  await call(SUB.yao, 'get', `/learners/${child.id}`, 403);
  assert.deepEqual((await call(SUB.yao, 'get', '/family/tutored', 200)).body.items, []);
});
