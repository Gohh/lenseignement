import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { roleFitsStructure, roleTitle } from '@lenseignement/types';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { membershipInvitations, memberships, organizations } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

// Nouveaux rôles (1er novembre) : qui nomme qui, et dans quelle structure.

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
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

async function withRole(
  userId: string,
  organizationId: string,
  role: string,
  run: () => Promise<void>,
) {
  const same = and(
    eq(memberships.userId, userId),
    eq(memberships.organizationId, organizationId),
    eq(memberships.role, role as never),
  );
  await ctx.db.delete(memberships).where(same);
  await ctx.db.insert(memberships).values({ userId, organizationId, role: role as never });
  try {
    await run();
  } finally {
    await ctx.db.delete(memberships).where(same);
  }
}

const unique = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test('titres et structures des rôles', () => {
  assert.equal(roleTitle('chef-etablissement', 'primary'), 'Directeur d’école');
  assert.equal(roleTitle('chef-etablissement', 'college'), 'Principal');
  assert.equal(roleTitle('chef-etablissement', 'lycee'), 'Proviseur');
  assert.equal(roleTitle('gestionnaire'), 'DRENA');
  assert.ok(roleFitsStructure('cabinet', 'ministry'));
  assert.ok(!roleFitsStructure('cabinet', 'primary'));
  assert.ok(roleFitsStructure('censeur', 'lycee'));
  assert.ok(!roleFitsStructure('censeur', 'primary'));
  assert.ok(roleFitsStructure('technopedagogue', 'central_direction'));
  assert.ok(!roleFitsStructure('inconnu', 'primary'));
});

test('IEPP, conseiller Alpha et direction : chacun nomme dans sa zone', async () => {
  const ieppName = unique('IEPP');
  const [iepp] = await ctx.db
    .insert(organizations)
    .values({ name: ieppName, type: 'iepp', parentId: ID.orgRegion })
    .returning({ id: organizations.id });
  const [linked, other, college, centre] = await ctx.db
    .insert(organizations)
    .values([
      {
        name: unique('EPP liée'),
        type: 'primary',
        parentId: ID.orgRegion,
        details: { iepp: ` ${ieppName.toUpperCase()} ` },
      },
      {
        name: unique('EPP autre'),
        type: 'primary',
        parentId: ID.orgRegion,
        details: { iepp: 'IEPP ailleurs' },
      },
      { name: unique('Collège'), type: 'college', parentId: ID.orgRegion },
      { name: unique('Centre'), type: 'literacy_center', parentId: ID.orgRegion },
    ])
    .returning({ id: organizations.id });
  const made = [iepp!.id, linked!.id, other!.id, college!.id, centre!.id];
  const invite = (subject: string, status: number, organizationId: string, role: string) =>
    call(subject, 'post', '/team/invitations', status, { organizationId, role, branches: null });
  try {
    // L'IEPP : un directeur dans les écoles qui la citent, des conseillers pédagogiques chez elle.
    await withRole(ID.userYao, iepp!.id, 'iepp', async () => {
      const team = (await call(SUB.yao, 'get', '/team', 200)).body;
      const visible = team.organizations.map((o: { id: string }) => o.id);
      assert.ok(visible.includes(linked!.id));
      assert.ok(!visible.includes(other!.id));
      assert.deepEqual(team.grantable, ['conseiller-pedagogique', 'chef-etablissement']);
      await invite(SUB.yao, 201, linked!.id, 'chef-etablissement');
      await invite(SUB.yao, 201, iepp!.id, 'conseiller-pedagogique');
      await invite(SUB.yao, 403, other!.id, 'chef-etablissement');
      await invite(SUB.yao, 403, linked!.id, 'enseignant');
      await invite(SUB.yao, 400, iepp!.id, 'chef-etablissement');
    });

    // Le conseiller Alpha : des alphabétiseurs dans les centres de sa DRENA, pas ailleurs.
    await withRole(ID.userYao, ID.orgRegion, 'conseiller-alpha', async () => {
      await invite(SUB.yao, 201, centre!.id, 'alphabetiseur');
      await invite(SUB.yao, 403, college!.id, 'alphabetiseur');
      await invite(SUB.yao, 403, centre!.id, 'chef-etablissement');
    });

    // Le principal : censeur, éducateur et correspondant fichier dans son collège.
    await withRole(ID.userYao, college!.id, 'chef-etablissement', async () => {
      await invite(SUB.yao, 201, college!.id, 'censeur');
      await invite(SUB.yao, 201, college!.id, 'educateur');
      await invite(SUB.yao, 201, college!.id, 'correspondant-fichier');
      await invite(SUB.yao, 400, college!.id, 'gestionnaire');
      await invite(SUB.yao, 403, college!.id, 'referent-pedagogique');
    });

    // L'administrateur nomme tout le monde, sauf un administrateur, là où le rôle convient.
    await withRole(ID.userAwa, ID.orgBaobabs, 'administrateur', async () => {
      await invite(SUB.awa, 201, ID.orgRegion, 'gestionnaire');
      await invite(SUB.awa, 201, college!.id, 'chef-etablissement');
      await invite(SUB.awa, 400, college!.id, 'cabinet');
      await invite(SUB.awa, 403, college!.id, 'administrateur');
    });
  } finally {
    await ctx.db
      .delete(membershipInvitations)
      .where(inArray(membershipInvitations.organizationId, [...made, ID.orgRegion]));
    await ctx.db.delete(organizations).where(inArray(organizations.id, made.slice(1)));
    await ctx.db.delete(organizations).where(eq(organizations.id, iepp!.id));
  }
});
