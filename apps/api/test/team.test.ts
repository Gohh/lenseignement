import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships } from '../src/db/schema.js';
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
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

const authoringBranches = async (subject: string) =>
  (await call(subject, 'get', '/authoring/organizations', 200)).body.items.map(
    (o: { branches: string[] }) => o.branches,
  );

test('ADR-021 : la direction invite un gestionnaire, règle ses cycles, puis retire son rôle', async () => {
  // Seule la direction (ou l’administrateur) gère une équipe.
  assert.deepEqual((await call(SUB.koffi, 'get', '/team', 200)).body.organizations, []);
  const team = (await call(SUB.bamba, 'get', '/team', 200)).body;
  assert.deepEqual(
    team.organizations.map((o: { id: string }) => o.id),
    [ID.orgManguiers],
  );
  assert.ok(!team.grantable.includes('chef-etablissement'));
  assert.ok(team.members.some((m: { userName: string }) => m.userName?.includes('Koffi')));

  // Refus : rôle réservé, structure d’un autre, rôle inconnu.
  const base = { organizationId: ID.orgManguiers, role: 'gestionnaire', branches: ['primaire'] };
  await call(SUB.koffi, 'post', '/team/invitations', 403, base);
  await call(SUB.bamba, 'post', '/team/invitations', 403, { ...base, role: 'chef-etablissement' });
  await call(SUB.bamba, 'post', '/team/invitations', 403, {
    ...base,
    organizationId: ID.orgBaobabs,
  });
  await call(SUB.bamba, 'post', '/team/invitations', 400, { ...base, role: 'roi' });
  await call(SUB.bamba, 'post', '/team/invitations', 400, { ...base, branches: [] });

  // Invitation : un code à usage unique.
  const { code } = (await call(SUB.bamba, 'post', '/team/invitations', 201, base)).body;
  assert.match(code, /^[A-Z2-9]{8}$/);
  await call(SUB.yao, 'post', '/team/invitations/redeem', 404, { code: 'AAAAAAAA' });
  assert.equal(
    (await call(SUB.yao, 'post', '/team/invitations/redeem', 201, { code })).body.role,
    'gestionnaire',
  );
  await call(SUB.awa, 'post', '/team/invitations/redeem', 404, { code });

  // Le gestionnaire rédige dans son cycle seulement.
  assert.deepEqual(await authoringBranches(SUB.yao), [['primaire']]);
  const member = (await call(SUB.bamba, 'get', '/team', 200)).body.members.find(
    (m: { role: string }) => m.role === 'gestionnaire',
  );
  assert.deepEqual(member.branches, ['primaire']);

  // Cycles modifiés, puis rôle retiré.
  await call(SUB.bamba, 'patch', `/team/members/${member.id}`, 200, {
    branches: ['alphabetisation'],
  });
  assert.deepEqual(await authoringBranches(SUB.yao), [['alphabetisation']]);
  await call(SUB.koffi, 'patch', `/team/members/${member.id}`, 404, { branches: null });
  await call(SUB.bamba, 'delete', `/team/members/${member.id}`, 200);
  assert.deepEqual(await authoringBranches(SUB.yao), []);
});

test('ADR-021 : le superadministrateur gère toutes les structures et les directions', async () => {
  const [row] = await ctx.db
    .insert(memberships)
    .values({ userId: ID.userAwa, organizationId: ID.orgRegion, role: 'superadministrateur' })
    .returning({ id: memberships.id });
  try {
    const team = (await call(SUB.awa, 'get', '/team', 200)).body;
    assert.equal(team.organizations.length, 3);
    assert.ok(team.grantable.includes('chef-etablissement'));
    const bamba = team.members.find(
      (m: { role: string; userName: string }) =>
        m.role === 'chef-etablissement' && m.userName?.includes('Bamba'),
    );
    // La direction ne retire pas sa propre direction ; le superadministrateur peut le faire.
    await call(SUB.bamba, 'patch', `/team/members/${bamba.id}`, 403, { branches: ['primaire'] });
    await call(SUB.awa, 'patch', `/team/members/${bamba.id}`, 200, { branches: null });
  } finally {
    await ctx.db
      .delete(memberships)
      .where(and(eq(memberships.id, row!.id), eq(memberships.role, 'superadministrateur')));
  }
});
