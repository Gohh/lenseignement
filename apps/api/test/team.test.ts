import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { createSuperadmin } from '../src/db/superadmin.js';
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
    // Garde-fou : le superadministrateur ne peut pas retirer son propre rôle.
    const self = team.members.find((m: { isSelf: boolean }) => m.isSelf);
    assert.equal(self.role, 'superadministrateur');
    const refused = await call(SUB.awa, 'delete', `/team/members/${self.id}`, 403);
    assert.match(refused.body.message, /propre rôle/);
  } finally {
    await ctx.db
      .delete(memberships)
      .where(and(eq(memberships.id, row!.id), eq(memberships.role, 'superadministrateur')));
  }
});

test("la commande superadmin rend le rôle à un compte qui l'avait perdu", async () => {
  await createSuperadmin(ctx.db, SUB.yao);
  const [row] = await ctx.db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, ID.userYao), eq(memberships.role, 'superadministrateur')));
  try {
    await ctx.db
      .update(memberships)
      .set({ validUntil: new Date(Date.now() - 1000) })
      .where(eq(memberships.id, row!.id));
    await createSuperadmin(ctx.db, SUB.yao);
    const [after] = await ctx.db
      .select({ validUntil: memberships.validUntil })
      .from(memberships)
      .where(eq(memberships.id, row!.id));
    assert.equal(after!.validUntil, null);
    // La structure technique « Plateforme » porte le rôle mais n'apparaît dans aucune liste.
    const names = (o: { name: string }) => o.name;
    const listed = (await call(SUB.yao, 'get', '/organizations', 200)).body.items.map(names);
    assert.ok(listed.length > 0);
    assert.ok(!listed.includes('Plateforme'));
    const team = (await call(SUB.yao, 'get', '/team', 200)).body;
    assert.ok(!team.organizations.map(names).includes('Plateforme'));
    // Plateforme vide (seulement la structure technique) : on peut créer le premier établissement.
    const visible = await ctx.db
      .update(organizations)
      .set({ internal: true })
      .where(eq(organizations.internal, false))
      .returning({ id: organizations.id });
    try {
      const empty = (await call(SUB.yao, 'get', '/team', 200)).body;
      assert.deepEqual(empty.organizations, []);
      assert.equal(empty.canCreateOrganization, true);
      assert.equal(empty.everywhere, true);
    } finally {
      await ctx.db
        .update(organizations)
        .set({ internal: false })
        .where(
          inArray(
            organizations.id,
            visible.map((v) => v.id),
          ),
        );
    }
  } finally {
    await ctx.db.delete(memberships).where(eq(memberships.id, row!.id));
    // La commande crée la structure « Plateforme » : on la retire pour ne pas fausser les autres tests.
    await ctx.db.delete(organizations).where(eq(organizations.name, 'Plateforme'));
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

test('configuration : liste filtrée, modification selon les rôles, archivage et rétablissement', async () => {
  const made: string[] = [];
  const tag = unique();
  try {
    await withRole(ID.userAwa, ID.orgBaobabs, 'administrateur', async () => {
      const drena = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name: `DRENA ${tag}`,
          type: 'authority',
        })
      ).body;
      made.push(drena.id);
      const school = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name: `Collège ${tag}`,
          type: 'college',
          parentId: drena.id,
          ...fiche,
        })
      ).body;
      made.push(school.id);

      // Liste : recherche, filtre par direction et par type ; fermée à qui ne gère rien.
      await call(SUB.koffi, 'get', '/organizations', 403);
      const found = (
        await call(SUB.awa, 'get', `/organizations?search=${encodeURIComponent(tag)}`, 200)
      ).body.items;
      assert.deepEqual(found.map((o: { id: string }) => o.id).sort(), [drena.id, school.id].sort());
      const byDirection = (await call(SUB.awa, 'get', `/organizations?direction=${drena.id}`, 200))
        .body.items;
      assert.deepEqual(ids(byDirection), [school.id]);
      assert.equal(byDirection[0].direction.name, `DRENA ${tag}`);
      const byType = (
        await call(
          SUB.awa,
          'get',
          `/organizations?type=college&search=${encodeURIComponent(tag)}`,
          200,
        )
      ).body.items;
      assert.deepEqual(ids(byType), [school.id]);

      // Fiche et modification.
      const detail = (await call(SUB.awa, 'get', `/organizations/${school.id}`, 200)).body;
      assert.equal(detail.can.edit, true);
      assert.equal(detail.can.editStructure, true);
      const renamed = (
        await call(SUB.awa, 'patch', `/organizations/${school.id}`, 200, {
          locality: 'Korhogo',
          managerContact: '0102030405',
        })
      ).body;
      assert.equal(renamed.locality, 'Korhogo');
      await call(SUB.awa, 'patch', `/organizations/${school.id}`, 400, { type: 'authority' });
      await call(SUB.awa, 'patch', `/organizations/${school.id}`, 400, { parentId: ID.orgBaobabs });
      await call(SUB.awa, 'get', '/organizations/pas-un-id', 404);

      // Archivage : refusé pour une DRENA qui a un établissement actif.
      await call(SUB.awa, 'post', `/organizations/${drena.id}/archive`, 400);
      const archived = (await call(SUB.awa, 'post', `/organizations/${school.id}/archive`, 201))
        .body;
      assert.ok(archived.archivedAt);
      assert.deepEqual(
        ids(
          (await call(SUB.awa, 'get', `/organizations?search=${encodeURIComponent(tag)}`, 200)).body
            .items,
        ),
        [drena.id],
      );
      assert.deepEqual(
        ids((await call(SUB.awa, 'get', '/organizations?archived=1', 200)).body.items),
        [school.id],
      );
      const team = (await call(SUB.awa, 'get', '/team', 200)).body;
      assert.ok(!ids(team.organizations).includes(school.id));
      await call(SUB.awa, 'post', '/team/invitations', 400, {
        organizationId: school.id,
        role: 'enseignant',
        branches: null,
      });
      // Rétablir la fiche, puis archiver la DRENA une fois vide.
      await call(SUB.awa, 'post', `/organizations/${school.id}/restore`, 201);
      await call(SUB.awa, 'post', `/organizations/${school.id}/archive`, 201);
      await call(SUB.awa, 'post', `/organizations/${drena.id}/archive`, 201);
      await call(SUB.awa, 'post', `/organizations/${school.id}/restore`, 400);
      await call(SUB.awa, 'post', `/organizations/${drena.id}/restore`, 201);
      await call(SUB.awa, 'post', `/organizations/${school.id}/restore`, 201);
    });

    // La direction d'un établissement modifie sa fiche, mais ni le type, ni la DRENA, ni l'archivage.
    const own = (await call(SUB.bamba, 'get', `/organizations/${ID.orgManguiers}`, 200)).body;
    assert.deepEqual(own.can, { edit: true, editStructure: false, archive: false });
    await call(SUB.bamba, 'patch', `/organizations/${ID.orgManguiers}`, 200, {
      managerName: 'M. Directeur',
    });
    await call(SUB.bamba, 'patch', `/organizations/${ID.orgManguiers}`, 403, { type: 'college' });
    await call(SUB.bamba, 'post', `/organizations/${ID.orgManguiers}/archive`, 403);
    await call(SUB.bamba, 'get', `/organizations/${ID.orgBaobabs}`, 404);
    await call(SUB.bamba, 'patch', `/organizations/${ID.orgBaobabs}`, 404, {
      locality: 'Ailleurs',
    });

    // Le gestionnaire de la DRENA modifie et archive dans sa zone, pas la DRENA elle-même.
    await withRole(ID.userYao, ID.orgRegion, 'gestionnaire', async () => {
      const zone = (await call(SUB.yao, 'get', `/organizations/${ID.orgBaobabs}`, 200)).body;
      assert.deepEqual(zone.can, { edit: true, editStructure: false, archive: true });
      const region = (await call(SUB.yao, 'get', `/organizations/${ID.orgRegion}`, 200)).body;
      assert.deepEqual(region.can, { edit: false, editStructure: false, archive: false });
      await call(SUB.yao, 'patch', `/organizations/${ID.orgRegion}`, 403, { name: 'Autre nom' });
    });
  } finally {
    await ctx.db
      .update(organizations)
      .set({ archivedAt: null })
      .where(inArray(organizations.id, made));
    await ctx.db
      .delete(membershipInvitations)
      .where(inArray(membershipInvitations.organizationId, made));
    for (const id of made.reverse())
      await ctx.db.delete(organizations).where(eq(organizations.id, id));
  }
});
