import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { auditLogs, memberships, withdrawnRights } from '../src/db/schema.js';
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
  await ctx.db.delete(withdrawnRights);
  await ctx.db.delete(memberships).where(inArray(memberships.id, granted));
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'put',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('droits : seul le superadministrateur les règle', async () => {
  await call(SUB.fatou, 'get', '/admin/rights', 403);
  await call(SUB.bamba, 'put', '/admin/rights', 403, { withdrawn: [] });
  assert.deepEqual((await call(SUB.yao, 'get', '/admin/rights', 200)).body, { withdrawn: [] });
  await call(SUB.yao, 'put', '/admin/rights', 400, {
    withdrawn: [{ profile: 'superadministrateur', right: 'journal' }],
  });
});

test('un droit retiré à l’administrateur ferme l’écran, puis le rendre le rouvre', async () => {
  const me = (await call(SUB.fatou, 'get', '/me', 200)).body;
  assert.ok(me.rights.includes('journal'));
  await call(SUB.fatou, 'get', '/admin/audit', 200);
  await call(SUB.fatou, 'get', '/admin/consult/classes', 200);

  const saved = (
    await call(SUB.yao, 'put', '/admin/rights', 200, {
      withdrawn: [
        { profile: 'administrateur', right: 'journal' },
        { profile: 'administrateur', right: 'consulter' },
        // Combinaison sans objet (le gestionnaire n'a pas ce droit) : ignorée.
        { profile: 'gestionnaire', right: 'comptes' },
      ],
    })
  ).body;
  assert.equal(saved.withdrawn.length, 2);

  assert.ok(!(await call(SUB.fatou, 'get', '/me', 200)).body.rights.includes('journal'));
  await call(SUB.fatou, 'get', '/admin/audit', 403);
  await call(SUB.fatou, 'get', '/admin/consult/classes', 403);
  // Les autres droits restent, et le superadministrateur garde tout.
  await call(SUB.fatou, 'get', '/admin/accounts', 200);
  await call(SUB.yao, 'get', '/admin/audit', 200);

  // La direction perd l'invitation de l'équipe.
  await call(SUB.yao, 'put', '/admin/rights', 200, {
    withdrawn: [{ profile: 'chef-etablissement', right: 'equipe' }],
  });
  await call(SUB.fatou, 'get', '/admin/audit', 200);
  const team = (await call(SUB.bamba, 'get', '/team', 200)).body;
  assert.deepEqual(team.grantable, []);

  await call(SUB.yao, 'put', '/admin/rights', 200, { withdrawn: [] });
  assert.ok((await call(SUB.bamba, 'get', '/team', 200)).body.grantable.length > 0);

  const logs = await ctx.db
    .select({ action: auditLogs.action, resourceId: auditLogs.resourceId })
    .from(auditLogs)
    .where(and(eq(auditLogs.resourceType, 'rights'), eq(auditLogs.actorUserId, ID.userYao)));
  assert.ok(
    logs.some((l) => l.action === 'rights.withdraw' && l.resourceId === 'administrateur journal'),
  );
  assert.ok(
    logs.some((l) => l.action === 'rights.grant' && l.resourceId === 'chef-etablissement equipe'),
  );
});

test('le superadministrateur ne publie pas de programme', async () => {
  const overview = (await call(SUB.yao, 'get', '/admin/curricula', 200)).body;
  assert.equal(overview.canPublish, false);
});
