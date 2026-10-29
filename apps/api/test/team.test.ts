import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { membershipInvitations, memberships, organizations } from '../src/db/schema.js';
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

const fiche = { locality: 'Bouaké', managerName: 'M. Essai' };
const unique = () => `Essai ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const ids = (list: Array<{ id: string }>) => list.map((o) => o.id);

test('création : la DRENA est une structure ; superadmin et administrateur partout, gestionnaire dans sa DRENA', async () => {
  const made: string[] = [];
  try {
    // Sans rôle de gestion, ou avec la seule direction : refus.
    const school = { type: 'primary_public', parentId: ID.orgRegion, ...fiche };
    await call(SUB.koffi, 'post', '/team/organizations', 403, { name: unique(), ...school });
    await call(SUB.bamba, 'post', '/team/organizations', 403, { name: unique(), ...school });

    // Administrateur : crée une DRENA, puis une école dessous ; pas de code de direction.
    let outsider = '';
    await withRole(ID.userAwa, ID.orgBaobabs, 'administrateur', async () => {
      const team = (await call(SUB.awa, 'get', '/team', 200)).body;
      assert.equal(team.organizations.length, 3);
      assert.equal(team.everywhere, true);
      assert.deepEqual(ids(team.directions), [ID.orgRegion]);
      assert.ok(!team.grantable.includes('chef-etablissement'));
      const drena = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name: unique(),
          type: 'authority',
        })
      ).body;
      made.push(drena.id);
      outsider = drena.id;
      assert.equal(drena.managerCode, null);
      // Une école exige une DRENA existante, une localité et un responsable.
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: unique(),
        type: 'college',
        ...fiche,
      });
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: unique(),
        ...school,
        parentId: ID.orgBaobabs,
      });
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: unique(),
        ...school,
        locality: '',
      });
      await call(SUB.awa, 'post', '/team/organizations', 400, { name: 'x', ...school });
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: unique(),
        ...school,
        type: 'inconnu',
      });
      const name = unique();
      const child = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name,
          ...school,
          parentId: drena.id,
        })
      ).body;
      made.push(child.id);
      assert.equal(child.managerCode, null);
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: name.toUpperCase(),
        ...school,
        parentId: drena.id,
      });
    });

    // Superadministrateur : il reçoit le code d'invitation du responsable.
    await withRole(ID.userAwa, ID.orgRegion, 'superadministrateur', async () => {
      const created = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name: unique(),
          ...school,
          type: 'lycee',
        })
      ).body;
      made.push(created.id);
      assert.match(created.managerCode, /^[A-Z2-9]{8}$/);
    });

    // Gestionnaire de la DRENA de démonstration : sa zone seulement.
    await withRole(ID.userYao, ID.orgRegion, 'gestionnaire', async () => {
      const team = (await call(SUB.yao, 'get', '/team', 200)).body;
      assert.equal(team.everywhere, false);
      assert.deepEqual(ids(team.directions), [ID.orgRegion]);
      assert.deepEqual(team.grantable, ['enseignant', 'alphabetiseur', 'referent-pedagogique']);
      await call(SUB.yao, 'post', '/team/organizations', 403, {
        name: unique(),
        type: 'authority',
      });
      await call(SUB.yao, 'post', '/team/organizations', 403, {
        name: unique(),
        ...school,
        parentId: outsider,
      });
      await call(SUB.yao, 'post', '/team/organizations', 400, {
        name: unique(),
        ...school,
        parentId: ID.orgManguiers,
      });
      const annex = (
        await call(SUB.yao, 'post', '/team/organizations', 201, { name: unique(), ...school })
      ).body;
      made.push(annex.id);
      assert.equal(annex.managerCode, null);
      const after = (await call(SUB.yao, 'get', '/team', 200)).body;
      assert.ok(ids(after.organizations).includes(annex.id));

      // Il invite un référent dans sa zone, mais ni une direction ni un administrateur, ni hors zone.
      const referent = {
        organizationId: ID.orgRegion,
        role: 'referent-pedagogique',
        branches: null,
      };
      await call(SUB.yao, 'post', '/team/invitations', 201, referent);
      await call(SUB.yao, 'post', '/team/invitations', 403, {
        ...referent,
        role: 'chef-etablissement',
      });
      await call(SUB.yao, 'post', '/team/invitations', 403, {
        ...referent,
        role: 'administrateur',
      });
      await call(SUB.yao, 'post', '/team/invitations', 403, {
        ...referent,
        organizationId: outsider,
      });
    });
  } finally {
    await ctx.db
      .delete(membershipInvitations)
      .where(inArray(membershipInvitations.organizationId, [...made, ID.orgRegion]));
    for (const id of made.reverse())
      await ctx.db.delete(organizations).where(eq(organizations.id, id));
  }
});

test('import CSV : aperçu sans rien écrire, puis création ; une erreur bloque tout', async () => {
  const drena = unique();
  const school = unique();
  const head = 'nom officiel;type;direction régionale;localité;responsable';
  const csv = `${head}\n${drena};autorité;;;\n${school};primaire public;${drena};Bouaké;M. Essai\n`;
  const count = async () => (await ctx.db.select().from(organizations)).length;
  const before = await count();
  await withRole(ID.userAwa, ID.orgBaobabs, 'administrateur', async () => {
    const preview = (
      await call(SUB.awa, 'post', '/team/organizations/import', 201, { csv, confirm: false })
    ).body;
    assert.deepEqual(
      preview.lines.map((l: { status: string }) => l.status),
      ['create', 'create'],
    );
    assert.equal(await count(), before);

    const bad = `${head}\n${school};truc;D;L;Rep\nab;collège;D;L;Rep\n${school};collège;Inconnue;L;Rep\n${school};collège;${drena};L;\n`;
    const errors = (
      await call(SUB.awa, 'post', '/team/organizations/import', 201, { csv: bad, confirm: false })
    ).body;
    assert.deepEqual(
      errors.lines.map((l: { status: string }) => l.status),
      ['error', 'error', 'error', 'error'],
    );
    await call(SUB.awa, 'post', '/team/organizations/import', 400, { csv: bad, confirm: true });
    await call(SUB.awa, 'post', '/team/organizations/import', 400, {
      csv: 'colonne\nx\n',
      confirm: false,
    });

    const done = (
      await call(SUB.awa, 'post', '/team/organizations/import', 201, { csv, confirm: true })
    ).body;
    assert.equal(done.created, 2);
    assert.equal(await count(), before + 2);
    // Deuxième passage : tout existe déjà.
    const again = (
      await call(SUB.awa, 'post', '/team/organizations/import', 201, { csv, confirm: true })
    ).body;
    assert.equal(again.created, 0);
    assert.deepEqual(
      again.lines.map((l: { status: string }) => l.status),
      ['exists', 'exists'],
    );
  });
  // Nettoyage : l'école d'abord.
  for (const name of [school, drena]) {
    await ctx.db.delete(organizations).where(eq(organizations.name, name));
  }
  // Un gestionnaire ne crée ni direction régionale, ni école hors de sa zone.
  await withRole(ID.userYao, ID.orgRegion, 'gestionnaire', async () => {
    const c = unique();
    const out = `${head}\n${c};autorité;;;\n${c};collège;Inconnue;Bouaké;M. Essai\n${c};collège;Direction régionale de démonstration (fictive);Bouaké;M. Essai\n`;
    const lines = (
      await call(SUB.yao, 'post', '/team/organizations/import', 201, { csv: out, confirm: false })
    ).body.lines;
    assert.deepEqual(
      lines.map((l: { status: string }) => l.status),
      ['error', 'error', 'create'],
    );
  });
  await call(SUB.koffi, 'post', '/team/organizations/import', 403, { csv, confirm: false });
});
