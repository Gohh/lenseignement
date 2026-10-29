import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
  await ctx.db.insert(memberships).values([
    { userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' },
    { userId: ID.userMariam, organizationId: ID.orgRegion, role: 'administrateur' },
  ]);
});

after(async () => {
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('comptes : liste, recherche, rôles ; réservée à l’administration', async () => {
  await call(SUB.bamba, 'get', '/admin/accounts', 403);
  const all = (await call(SUB.mariam, 'get', '/admin/accounts', 200)).body;
  assert.ok(all.total >= 7);
  assert.equal(all.canSeeJournal, false);
  const found = (await call(SUB.mariam, 'get', '/admin/accounts?search=bamba', 200)).body;
  assert.equal(found.items.length, 1);
  assert.ok(found.items[0].roles.some((r: { role: string }) => r.role === 'chef-etablissement'));
  const teachers = (await call(SUB.yao, 'get', '/admin/accounts?role=enseignant', 200)).body;
  assert.ok(teachers.items.some((u: { id: string }) => u.id === ID.userKoffi));
  assert.equal(teachers.canSeeJournal, true);
});

test('suspendre bloque l’accès ; réactiver le rend ; garde-fous', async () => {
  await call(SUB.mariam, 'post', `/admin/accounts/${ID.userKoffi}/status`, 204, {
    status: 'suspended',
  });
  await call(SUB.koffi, 'get', '/me', 403);
  const suspended = (await call(SUB.yao, 'get', '/admin/accounts?status=suspended', 200)).body;
  assert.deepEqual(
    suspended.items.map((u: { id: string }) => u.id),
    [ID.userKoffi],
  );
  await call(SUB.mariam, 'post', `/admin/accounts/${ID.userKoffi}/status`, 204, {
    status: 'active',
  });
  await call(SUB.koffi, 'get', '/me', 200);

  // Ni soi-même, ni le superadministrateur ; l'administrateur ne suspend pas son égal.
  await call(SUB.yao, 'post', `/admin/accounts/${ID.userYao}/status`, 400, { status: 'suspended' });
  await call(SUB.mariam, 'post', `/admin/accounts/${ID.userYao}/status`, 403, {
    status: 'suspended',
  });
  await call(SUB.bamba, 'post', `/admin/accounts/${ID.userAwa}/status`, 403, {
    status: 'suspended',
  });
});

test('journal : superadministrateur seulement, filtré par domaine', async () => {
  await call(SUB.mariam, 'get', '/admin/audit', 403);
  const page = (await call(SUB.yao, 'get', '/admin/audit?domain=account', 200)).body;
  assert.deepEqual(
    page.items.map((i: { action: string }) => i.action),
    ['account.reactivate', 'account.suspend'],
  );
  assert.ok(page.items[0].actorName);
  assert.equal(page.hasMore, false);
  await call(SUB.yao, 'get', '/admin/audit?from=29-10-2026', 400);
});
