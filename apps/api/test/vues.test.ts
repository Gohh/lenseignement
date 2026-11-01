import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships, organizations } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

// Étape 3 des profils (1er novembre) : ce que voit chaque nouveau rôle.
// Yao n'a aucun rôle dans les données de démonstration : on lui en donne un à la fois.

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

async function call(path: string, status: number) {
  const token = await ctx.sign({ sub: SUB.yao });
  return request(ctx.app.getHttpServer())
    .get(`/api/v1${path}`)
    .set('authorization', `Bearer ${token}`)
    .expect(status);
}

async function asYao(organizationId: string, role: string, run: () => Promise<void>) {
  const same = and(
    eq(memberships.userId, ID.userYao),
    eq(memberships.organizationId, organizationId),
    eq(memberships.role, role as never),
  );
  await ctx.db.delete(memberships).where(same);
  await ctx.db
    .insert(memberships)
    .values({ userId: ID.userYao, organizationId, role: role as never });
  try {
    await run();
  } finally {
    await ctx.db.delete(memberships).where(same);
  }
}

const unique = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Noms des structures couvertes par le tableau de chiffres anonymes. */
async function statsScope(): Promise<string[]> {
  return (await call('/stats/overview', 200)).body.organizations;
}

async function rights(): Promise<string[]> {
  return (await call('/me', 200)).body.rights;
}

test('chaque nouveau rôle voit les chiffres de sa zone, sans aucun nom', async () => {
  const [ministry, otherDrena] = await ctx.db
    .insert(organizations)
    .values([
      { name: unique('Cabinet'), type: 'ministry' },
      { name: unique('DRENA lointaine'), type: 'authority' },
    ])
    .returning({ id: organizations.id, name: organizations.name });
  const ieppName = unique('IEPP');
  const [partnerNational, partnerRegional, apfc, iepp, farSchool] = await ctx.db
    .insert(organizations)
    .values([
      { name: unique('PTF national'), type: 'partner' },
      { name: unique('PTF régional'), type: 'partner', parentId: ID.orgRegion },
      { name: unique('APFC'), type: 'apfc', parentId: ID.orgRegion },
      { name: ieppName, type: 'iepp', parentId: ID.orgRegion },
      { name: unique('EPP lointaine'), type: 'primary', parentId: otherDrena!.id },
    ])
    .returning({ id: organizations.id, name: organizations.name });
  const [linked] = await ctx.db
    .insert(organizations)
    .values({
      name: unique('EPP liée'),
      type: 'primary',
      parentId: ID.orgRegion,
      details: { iepp: ieppName },
    })
    .returning({ id: organizations.id, name: organizations.name });
  const made = [linked!, partnerNational!, partnerRegional!, apfc!, iepp!, farSchool!].map(
    (o) => o.id,
  );
  const [manguiers] = await ctx.db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ID.orgManguiers));
  try {
    // Sans rôle : rien.
    await call('/stats/overview', 403);

    // Le cabinet : tout le pays, en lecture seule (ni suivi nominatif, ni équipe).
    await asYao(ministry!.id, 'cabinet', async () => {
      const scope = await statsScope();
      assert.ok(scope.includes(manguiers!.name));
      assert.ok(scope.includes(farSchool!.name));
      assert.deepEqual(await rights(), ['statistiques']);
      await call('/direction/overview', 403);
    });

    // Le partenaire national voit tout le pays ; le partenaire régional, sa DRENA seulement.
    await asYao(partnerNational!.id, 'partenaire', async () => {
      assert.ok((await statsScope()).includes(farSchool!.name));
    });
    await asYao(partnerRegional!.id, 'partenaire', async () => {
      const scope = await statsScope();
      assert.ok(scope.includes(manguiers!.name));
      assert.ok(!scope.includes(farSchool!.name));
    });

    // L'APFC : sa DRENA et ses établissements.
    await asYao(apfc!.id, 'apfc', async () => {
      const scope = await statsScope();
      assert.ok(scope.includes(manguiers!.name));
      assert.ok(!scope.includes(farSchool!.name));
    });

    // Le conseiller pédagogique : les écoles de son IEPP, sans gérer leur équipe.
    await asYao(iepp!.id, 'conseiller-pedagogique', async () => {
      const scope = await statsScope();
      assert.ok(scope.includes(linked!.name));
      assert.ok(!scope.includes(manguiers!.name));
      assert.deepEqual((await call('/team', 200)).body.grantable, []);
    });
  } finally {
    await ctx.db.delete(organizations).where(inArray(organizations.id, made));
    await ctx.db
      .delete(organizations)
      .where(inArray(organizations.id, [ministry!.id, otherDrena!.id]));
  }
});

test('censeur et éducateur suivent leur établissement ; le censeur tient les classes', async () => {
  await asYao(ID.orgManguiers, 'censeur', async () => {
    const overview = (await call('/direction/overview', 200)).body;
    assert.equal(overview.organization.id, ID.orgManguiers);
    assert.deepEqual(
      overview.organizations.map((o: { id: string }) => o.id),
      [ID.orgManguiers],
    );
    await call(`/cohorts/${ID.cohortCp1A}`, 200);
    await call(`/organizations/${ID.orgManguiers}/cohorts`, 200);
    await call(`/organizations/${ID.orgBaobabs}/cohorts`, 404);
    await call(`/cohorts/${ID.cohortCe1Baobabs}`, 403);
    const scope = await statsScope();
    assert.equal(scope.length, 1);
  });

  // L'éducateur voit le suivi et les classes, mais ne les gère pas et n'a pas les statistiques.
  await asYao(ID.orgManguiers, 'educateur', async () => {
    await call('/direction/overview', 200);
    await call(`/cohorts/${ID.cohortCp1A}`, 200);
    await call(`/organizations/${ID.orgManguiers}/cohorts`, 404);
    await call('/stats/overview', 403);
    assert.deepEqual(await rights(), ['suivi']);
  });
});
