import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { auditLogs, memberships } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
const granted: string[] = [];

before(async () => {
  ctx = await createTestApp();
  const rows = await ctx.db
    .insert(memberships)
    .values([
      { userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' },
      { userId: ID.userFatou, organizationId: ID.orgRegion, role: 'administrateur' },
    ])
    .returning({ id: memberships.id });
  granted.push(...rows.map((r) => r.id));
});

after(async () => {
  await ctx.db.delete(memberships).where(inArray(memberships.id, granted));
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

const code = `TEST-PROG-${randomInt(100000)}`;
const file = (label: string, extra: object = {}) => ({
  curriculum: {
    code,
    branch: 'primaire',
    title: 'Programme d’essai',
    description: 'Programme fictif pour les tests.',
  },
  version: { label, source: { title: 'Note fictive', issuer: 'Tests', isOfficial: false } },
  levels: [{ code: 'CP1', title: 'CP1' }],
  subjects: [{ code: 'MATH', title: 'Mathématiques' }],
  competencies: [
    { code: 'M1', title: 'Compter jusqu’à 10', subject: 'MATH', level: 'CP1' },
    { code: 'M2', title: 'Additionner', subject: 'MATH', level: 'CP1', prerequisites: ['M1'] },
  ],
  ...extra,
});

test('programmes : la direction et l’enseignant n’ont pas accès', async () => {
  await call(SUB.bamba, 'get', '/admin/curricula', 403);
  await call(SUB.koffi, 'post', '/admin/curricula', 403, { json: JSON.stringify(file('A')) });
});

test('l’administrateur importe un brouillon, le relit, mais ne le publie pas', async () => {
  const res = (
    await call(SUB.fatou, 'post', '/admin/curricula', 201, {
      json: `\uFEFF${JSON.stringify(file('2027'))}`,
    })
  ).body;
  assert.deepEqual(res, { code, label: '2027' });

  const overview = (await call(SUB.fatou, 'get', '/admin/curricula', 200)).body;
  assert.equal(overview.canPublish, false);
  const programme = overview.items.find((c: { code: string }) => c.code === code);
  assert.equal(programme.versions[0].status, 'draft');
  assert.deepEqual(programme.versions[0].counts, { levels: 1, subjects: 1, competencies: 2 });
  // Les programmes de démonstration publiés sont aussi listés.
  assert.ok(overview.items.some((c: { code: string }) => c.code === 'DEMO-ALPHA'));

  const detail = (await call(SUB.fatou, 'get', `/admin/curricula/${code}/versions/2027`, 200)).body;
  assert.equal(detail.version.effectiveFrom, null);
  assert.deepEqual(detail.competencies[1].prerequisites, ['M1']);

  // Le brouillon n'est pas public, même dans la liste.
  await request(ctx.app.getHttpServer()).get(`/api/v1/catalog/curricula/${code}`).expect(404);
  const list = await request(ctx.app.getHttpServer())
    .get('/api/v1/catalog/curricula?branch=primaire')
    .expect(200);
  assert.ok(!list.body.items.some((c: { code: string }) => c.code === code));

  await call(SUB.fatou, 'post', `/admin/curricula/${code}/versions/2027/publish`, 403, {
    effectiveFrom: '2027-09-01',
  });
});

test('fichiers refusés : JSON illisible, champ manquant, version en double', async () => {
  const bad = (await call(SUB.yao, 'post', '/admin/curricula', 400, { json: '{ pas du json' }))
    .body;
  assert.match(bad.message, /JSON lisible/);
  const invalid = (
    await call(SUB.yao, 'post', '/admin/curricula', 400, {
      json: JSON.stringify(file('2028', { subjects: [] })),
    })
  ).body;
  assert.match(invalid.message, /subjects/);
  const dup = (
    await call(SUB.yao, 'post', '/admin/curricula', 409, { json: JSON.stringify(file('2027')) })
  ).body;
  assert.match(dup.message, /existe déjà/);
});

test('seul le référent pédagogique publie, à une date ; le brouillon devient public et figé', async () => {
  await call(SUB.yao, 'post', `/admin/curricula/${code}/versions/2027/publish`, 403, {
    effectiveFrom: '2026-09-01',
  });
  const overview = (await call(SUB.mariam, 'get', '/admin/curricula', 200)).body;
  assert.equal(overview.canPublish, true);
  await call(SUB.mariam, 'post', `/admin/curricula/${code}/versions/2027/publish`, 400, {
    effectiveFrom: '01/09/2027',
  });
  await call(SUB.mariam, 'post', `/admin/curricula/${code}/versions/2027/publish`, 204, {
    effectiveFrom: '2026-09-01',
  });
  const pub = (await request(ctx.app.getHttpServer()).get(`/api/v1/catalog/curricula/${code}`))
    .body;
  assert.equal(pub.version.label, '2027');
  await call(SUB.mariam, 'post', `/admin/curricula/${code}/versions/2027/publish`, 409, {
    effectiveFrom: '2027-09-01',
  });
  await call(SUB.mariam, 'delete', `/admin/curricula/${code}/versions/2027`, 409);

  const logs = await ctx.db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(and(eq(auditLogs.resourceType, 'curriculum'), eq(auditLogs.resourceId, `${code} 2027`)));
  assert.deepEqual(logs.map((l) => l.action).sort(), ['curriculum.import', 'curriculum.publish']);
});

test('un brouillon importé par erreur se supprime', async () => {
  await call(SUB.fatou, 'post', '/admin/curricula', 201, { json: JSON.stringify(file('2029')) });
  await call(SUB.fatou, 'delete', `/admin/curricula/${code}/versions/2029`, 204);
  await call(SUB.fatou, 'get', `/admin/curricula/${code}/versions/2029`, 404);
  // Le libellé est de nouveau libre.
  await call(SUB.fatou, 'post', '/admin/curricula', 201, { json: JSON.stringify(file('2029')) });
});
