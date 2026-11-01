import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships, organizations } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

// Services et partenaires : cabinet, directions centrales, APFC, IEPP, partenaires.

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'patch',
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

test('structures : le cabinet et les directions centrales sont nationaux, l’APFC et l’IEPP dans une DRENA', async () => {
  const made: string[] = [];
  const create = async (subject: string, status: number, body: object) => {
    const res = await call(subject, 'post', '/team/organizations', status, body);
    if (status === 201) made.push(res.body.id);
    return res.body;
  };
  try {
    await withRole(ID.userAwa, ID.orgBaobabs, 'administrateur', async () => {
      // National : sans DRENA, même si on en donne une ; pas de code de direction.
      const cabinet = await create(SUB.awa, 201, { name: unique('Cabinet'), type: 'ministry' });
      assert.equal(cabinet.managerCode, null);
      const central = await create(SUB.awa, 201, {
        name: unique('DPFC'),
        type: 'central_direction',
        parentId: ID.orgRegion,
      });
      const partner = await create(SUB.awa, 201, { name: unique('PTF'), type: 'partner' });

      // APFC et IEPP : une DRENA obligatoire, mais ni localité ni responsable.
      await create(SUB.awa, 400, { name: unique('IEPP'), type: 'iepp' });
      await create(SUB.awa, 400, {
        name: unique('IEPP'),
        type: 'iepp',
        parentId: ID.orgManguiers,
      });
      const iepp = await create(SUB.awa, 201, {
        name: unique('IEPP'),
        type: 'iepp',
        parentId: ID.orgRegion,
      });
      assert.equal(iepp.managerCode, null);
      await create(SUB.awa, 201, { name: unique('APFC'), type: 'apfc', parentId: ID.orgRegion });

      const rows = await ctx.db
        .select({ id: organizations.id, parentId: organizations.parentId })
        .from(organizations)
        .where(inArray(organizations.id, [cabinet.id, central.id, partner.id, iepp.id]));
      const parent = new Map(rows.map((r) => [r.id, r.parentId]));
      assert.equal(parent.get(cabinet.id), null);
      assert.equal(parent.get(central.id), null);
      assert.equal(parent.get(partner.id), null);
      assert.equal(parent.get(iepp.id), ID.orgRegion);

      // Onglet « Services et partenaires » : ni établissement ni DRENA ; et l'inverse.
      const services = (await call(SUB.awa, 'get', '/organizations?kind=services', 200)).body
        .items as Array<{ id: string; type: string }>;
      const serviceIds = services.map((o) => o.id);
      for (const id of [cabinet.id, central.id, partner.id, iepp.id]) {
        assert.ok(serviceIds.includes(id));
      }
      const schools = (await call(SUB.awa, 'get', '/organizations?kind=etablissements', 200)).body
        .items as Array<{ id: string }>;
      assert.ok(!schools.some((o) => serviceIds.includes(o.id)));
      const filtered = (await call(SUB.awa, 'get', '/organizations?kind=services&type=iepp', 200))
        .body.items as Array<{ type: string }>;
      assert.ok(filtered.length > 0 && filtered.every((o) => o.type === 'iepp'));

      // Une IEPP n'a pas de classes.
      const cohorts = (await call(SUB.awa, 'get', `/organizations/${iepp.id}/cohorts`, 200)).body;
      assert.deepEqual(cohorts.levels, []);

      // Modifier : on reste dans sa famille ; un partenaire devient régional puis national.
      await call(SUB.awa, 'patch', `/organizations/${iepp.id}`, 400, { type: 'primary' });
      await call(SUB.awa, 'patch', `/organizations/${iepp.id}`, 400, { type: 'authority' });
      await call(SUB.awa, 'patch', `/organizations/${iepp.id}`, 400, { parentId: null });
      const apfc = (
        await call(SUB.awa, 'patch', `/organizations/${iepp.id}`, 200, { type: 'apfc' })
      ).body;
      assert.equal(apfc.direction.id, ID.orgRegion);
      const regional = (
        await call(SUB.awa, 'patch', `/organizations/${partner.id}`, 200, {
          parentId: ID.orgRegion,
        })
      ).body;
      assert.equal(regional.direction.id, ID.orgRegion);
      const national = (
        await call(SUB.awa, 'patch', `/organizations/${partner.id}`, 200, { parentId: null })
      ).body;
      assert.equal(national.direction, null);
      await call(SUB.awa, 'patch', `/organizations/${cabinet.id}`, 400, {
        parentId: ID.orgRegion,
      });
      // Une DRENA ne devient pas un service, un établissement ne devient pas une IEPP.
      await call(SUB.awa, 'patch', `/organizations/${ID.orgRegion}`, 400, { type: 'iepp' });
      await call(SUB.awa, 'patch', `/organizations/${ID.orgManguiers}`, 400, { type: 'iepp' });

      // Import CSV : les nouveaux types sont reconnus.
      const [region] = await ctx.db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, ID.orgRegion));
      const csv = [
        'nom officiel,type,direction régionale,localité,responsable',
        `${unique('Cabinet')},cabinet,,,`,
        `${unique('IEPP')},IEPP,${region!.name},,`,
        `${unique('APFC')},APFC,,,`,
      ].join('\n');
      const preview = (
        await call(SUB.awa, 'post', '/team/organizations/import', 201, { csv, confirm: false })
      ).body;
      assert.deepEqual(
        preview.lines.map((l: { status: string }) => l.status),
        ['create', 'create', 'error'],
      );
    });

    // Gestionnaire de la DRENA : une IEPP ou une APFC chez lui ; rien de national.
    await withRole(ID.userYao, ID.orgRegion, 'gestionnaire', async () => {
      await create(SUB.yao, 403, { name: unique('Cabinet'), type: 'ministry' });
      await create(SUB.yao, 403, { name: unique('PTF'), type: 'partner' });
      const iepp = await create(SUB.yao, 201, {
        name: unique('IEPP'),
        type: 'iepp',
        parentId: ID.orgRegion,
      });
      const fiche = (await call(SUB.yao, 'get', `/organizations/${iepp.id}`, 200)).body;
      assert.equal(fiche.can.edit, true);
      assert.equal(fiche.can.editStructure, false);
    });

    // La direction d'une école ne voit pas l'onglet et ne crée rien.
    await create(SUB.bamba, 403, { name: unique('IEPP'), type: 'iepp', parentId: ID.orgRegion });
  } finally {
    if (made.length > 0) {
      await ctx.db.delete(organizations).where(inArray(organizations.id, made));
    }
  }
});
