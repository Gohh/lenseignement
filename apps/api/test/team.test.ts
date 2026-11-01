import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
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
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('ADR-021 : la direction invite un correspondant fichier, règle ses cycles, puis retire son rôle', async () => {
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
  const base = {
    organizationId: ID.orgManguiers,
    role: 'correspondant-fichier',
    branches: ['primaire'],
  };
  // Une direction ne nomme plus de gestionnaire (DRENA), rôle qui ne va pas dans une école.
  assert.ok(!team.grantable.includes('gestionnaire'));
  await call(SUB.bamba, 'post', '/team/invitations', 400, { ...base, role: 'gestionnaire' });
  await call(SUB.koffi, 'post', '/team/invitations', 403, base);
  await call(SUB.bamba, 'post', '/team/invitations', 403, { ...base, role: 'chef-etablissement' });
  // Une direction ne nomme jamais d'administrateur (rôle national).
  assert.ok(!team.grantable.includes('administrateur'));
  await call(SUB.bamba, 'post', '/team/invitations', 403, { ...base, role: 'administrateur' });
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
    'correspondant-fichier',
  );
  await call(SUB.awa, 'post', '/team/invitations/redeem', 404, { code });

  // Liste des invitations : un code utilisé n'est plus attendu, il n'apparaît plus ;
  // l'enseignant ne voit rien.
  const pendingCodes = async () =>
    (await call(SUB.bamba, 'get', '/team/invitations', 200)).body.items.map(
      (i: { code: string }) => i.code,
    );
  assert.ok(!(await pendingCodes()).includes(code));
  assert.deepEqual((await call(SUB.koffi, 'get', '/team/invitations', 200)).body.items, []);
  // Un code utilisé ne se révoque plus ; un code actif, oui, une seule fois pour tous.
  const [used] = await ctx.db
    .select({ id: membershipInvitations.id })
    .from(membershipInvitations)
    .where(eq(membershipInvitations.code, code));
  await call(SUB.bamba, 'delete', `/team/invitations/${used!.id}`, 400);
  const second = (await call(SUB.bamba, 'post', '/team/invitations', 201, { ...base, days: 3 }))
    .body;
  const waiting = (await call(SUB.bamba, 'get', '/team/invitations', 200)).body.items.find(
    (i: { code: string }) => i.code === second.code,
  );
  assert.equal(waiting.state, 'active');
  assert.equal(waiting.role, base.role);
  const secondId = waiting.id;
  await call(SUB.koffi, 'delete', `/team/invitations/${secondId}`, 404);
  await call(SUB.bamba, 'delete', `/team/invitations/${secondId}`, 200);
  await call(SUB.awa, 'post', '/team/invitations/redeem', 404, { code: second.code });
  // Révoqué : plus attendu non plus.
  assert.ok(!(await pendingCodes()).includes(second.code));
  await call(SUB.bamba, 'post', '/team/invitations', 400, { ...base, days: 99 });

  // Le rôle est accordé pour son cycle seulement.
  const memberOf = async () =>
    (await call(SUB.bamba, 'get', '/team', 200)).body.members.find(
      (m: { role: string }) => m.role === 'correspondant-fichier',
    );
  const member = await memberOf();
  assert.deepEqual(member.branches, ['primaire']);

  // Cycles modifiés, puis rôle retiré.
  await call(SUB.bamba, 'patch', `/team/members/${member.id}`, 200, {
    branches: ['alphabetisation'],
  });
  assert.deepEqual((await memberOf()).branches, ['alphabetisation']);
  await call(SUB.koffi, 'patch', `/team/members/${member.id}`, 404, { branches: null });
  await call(SUB.bamba, 'delete', `/team/members/${member.id}`, 200);
  assert.equal(await memberOf(), undefined);

  // Le rôle retiré passe dans « Anciens membres » ; on peut le rendre, avec ses cycles.
  const former = (await call(SUB.bamba, 'get', '/team', 200)).body.former.find(
    (m: { id: string }) => m.id === member.id,
  );
  assert.equal(former.role, 'correspondant-fichier');
  assert.ok(former.removedAt);
  await call(SUB.koffi, 'post', `/team/members/${member.id}/restore`, 404);
  await call(SUB.bamba, 'post', `/team/members/${member.id}/restore`, 201);
  assert.deepEqual((await memberOf()).branches, ['alphabetisation']);
  assert.ok(
    !(await call(SUB.bamba, 'get', '/team', 200)).body.former.some(
      (m: { id: string }) => m.id === member.id,
    ),
  );
  const again = await call(SUB.bamba, 'post', `/team/members/${member.id}/restore`, 400);
  assert.match(again.body.message, /déjà actif/);
  await call(SUB.bamba, 'delete', `/team/members/${member.id}`, 200);
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
    const school = { type: 'primary', parentId: ID.orgRegion, ...fiche };
    await call(SUB.koffi, 'post', '/team/organizations', 403, { name: unique(), ...school });
    await call(SUB.bamba, 'post', '/team/organizations', 403, { name: unique(), ...school });

    // Administrateur : crée une DRENA, puis une école dessous ; pas de code de direction.
    let outsider = '';
    await withRole(ID.userAwa, ID.orgBaobabs, 'administrateur', async () => {
      const team = (await call(SUB.awa, 'get', '/team', 200)).body;
      assert.equal(team.organizations.length, 3);
      assert.equal(team.everywhere, true);
      assert.deepEqual(ids(team.directions), [ID.orgRegion]);
      // L'administrateur nomme désormais les chefs d'établissement (décision du 1er novembre).
      assert.ok(team.grantable.includes('chef-etablissement'));
      // Seul le superadministrateur nomme un administrateur.
      assert.ok(!team.grantable.includes('administrateur'));
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
      assert.match(child.managerCode, /^[A-Z2-9]{8}$/);
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
      assert.deepEqual(team.grantable, [
        'referent-pedagogique',
        'apfc',
        'iepp',
        'conseiller-alpha',
        'chef-etablissement',
        'conseiller-orientation',
        'enseignant',
        'alphabetiseur',
      ]);
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
      // La DRENA nomme le chef de ses établissements : elle reçoit le code.
      assert.match(annex.managerCode, /^[A-Z2-9]{8}$/);
      const after = (await call(SUB.yao, 'get', '/team', 200)).body;
      assert.ok(ids(after.organizations).includes(annex.id));

      // Il invite un référent dans sa zone, mais ni un administrateur, ni hors zone ; une direction
      // se donne dans une école, pas dans la DRENA.
      const referent = {
        organizationId: ID.orgRegion,
        role: 'referent-pedagogique',
        branches: null,
      };
      await call(SUB.yao, 'post', '/team/invitations', 201, referent);
      await call(SUB.yao, 'post', '/team/invitations', 400, {
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

test('en-tête : « L’Enseignement à » l’établissement de la personne, avec sa DRENA', async () => {
  const { establishment } = (await call(SUB.bamba, 'get', '/organizations/mine', 200)).body;
  assert.deepEqual(establishment, {
    name: 'École primaire Les Manguiers (fictive)',
    direction: 'Direction régionale de démonstration (fictive)',
    locality: null,
  });
  // Sans rattachement ni pouvoir sur toutes les structures : pas d'établissement.
  const none = (await call(`nouveau-${Date.now()}`, 'get', '/organizations/mine', 200)).body;
  assert.equal(none.establishment, null);
});

test('trois administrateurs au plus ; seul le superadministrateur les nomme', async () => {
  await createSuperadmin(ctx.db, SUB.yao);
  const added: string[] = [];
  try {
    const base = { organizationId: ID.orgManguiers, role: 'administrateur', branches: null };
    // Deux administrateurs existent déjà : le troisième est accepté, le quatrième refusé.
    for (const userId of [ID.userAwa, ID.userKoffi]) {
      const [row] = await ctx.db
        .insert(memberships)
        .values({ userId, organizationId: ID.orgManguiers, role: 'administrateur' })
        .returning({ id: memberships.id });
      added.push(row!.id);
    }
    const { code } = (await call(SUB.yao, 'post', '/team/invitations', 201, base)).body;
    // Mariam fait déjà partie d'une équipe : un seul code d'invitation par personne.
    await call(SUB.mariam, 'post', '/team/invitations/redeem', 400, { code });
    const redeemed = await call('futur-admin', 'post', '/team/invitations/redeem', 201, { code });
    assert.equal(redeemed.body.role, 'administrateur');
    const refused = (await call(SUB.yao, 'post', '/team/invitations', 400, base)).body;
    assert.match(refused.message, /déjà 3 administrateurs/);
  } finally {
    await ctx.db
      .delete(memberships)
      .where(
        and(
          eq(memberships.role, 'administrateur'),
          or(
            inArray(memberships.userId, [ID.userAwa, ID.userKoffi, ID.userMariam]),
            sql`${memberships.userId} in (select id from users where oidc_subject = 'futur-admin')`,
          ),
        ),
      );
    await ctx.db
      .delete(memberships)
      .where(and(eq(memberships.userId, ID.userYao), eq(memberships.role, 'superadministrateur')));
    await ctx.db.delete(organizations).where(eq(organizations.internal, true));
  }
});

test('code d’enseignant : plusieurs personnes, fiche niveaux et matières, validation par la direction', async () => {
  const [first, second] = ['ens-demande-1', 'ens-demande-2'];
  const base = { organizationId: ID.orgManguiers, role: 'enseignant', branches: null };
  const { code } = (await call(SUB.bamba, 'post', '/team/invitations', 201, base)).body;
  const listed = (await call(SUB.bamba, 'get', '/team/invitations', 200)).body.items;
  assert.equal(listed.find((i: { code: string }) => i.code === code).maxUses, null);

  // Aperçu : les niveaux de l'école primaire, sans la maternelle.
  const preview = (await call(first, 'post', '/team/invitations/preview', 201, { code })).body;
  assert.equal(preview.needsValidation, true);
  const levels = preview.levels.map((l: { code: string }) => l.code);
  assert.deepEqual(levels, ['cp1', 'cp2', 'ce1', 'ce2', 'cm1', 'cm2']);

  // Sans niveau ni matière : refusé. Avec : demande en attente, pas encore membre.
  await call(first, 'post', '/team/invitations/redeem', 400, { code });
  const sent = await call(first, 'post', '/team/invitations/redeem', 201, {
    code,
    levels: ['cp1', 'mat-1'],
    subjects: ['Mathématiques', 'mathématiques', 'Français'],
  });
  assert.equal(sent.body.pending, true);
  await call(second, 'post', '/team/invitations/redeem', 201, {
    code,
    levels: ['cm2'],
    subjects: ['Éveil'],
  });
  const mine = (await call(first, 'get', '/team/requests/mine', 200)).body.items;
  assert.equal(mine[0].status, 'pending');
  assert.deepEqual(mine[0].levels, ['cp1']);
  assert.equal(mine[0].subjects.length, 2);
  const team = (await call(SUB.bamba, 'get', '/team', 200)).body;
  assert.ok(!team.members.some((m: { userName: string | null }) => m.userName === null));

  // La direction voit les deux demandes et la cloche ; un enseignant ne voit rien.
  const pending = (await call(SUB.bamba, 'get', '/team/requests', 200)).body.items;
  assert.equal(pending.length, 2);
  assert.equal((await call(SUB.bamba, 'get', '/me/help-badge', 200)).body.teamRequests, 2);
  assert.deepEqual((await call(SUB.koffi, 'get', '/team/requests', 200)).body.items, []);
  const [a, b] = pending;
  await call(SUB.koffi, 'post', `/team/requests/${a.id}/approve`, 404, {
    levels: ['cp1'],
    subjects: ['Français'],
  });

  // Validée avec correction : membre avec ses niveaux, matières et le cycle primaire.
  await call(SUB.bamba, 'post', `/team/requests/${a.id}/approve`, 201, {
    levels: ['cp1', 'cp2'],
    subjects: ['Français'],
  });
  await call(SUB.bamba, 'post', `/team/requests/${b.id}/refuse`, 201);
  await call(SUB.bamba, 'post', `/team/requests/${b.id}/approve`, 400, {
    levels: ['cm2'],
    subjects: ['Éveil'],
  });
  const [member] = await ctx.db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, ID.orgManguiers), eq(memberships.role, 'enseignant')))
    .then((rows) => rows.filter((r) => r.levels?.includes('cp2')));
  assert.deepEqual(member!.levels, ['cp1', 'cp2']);
  assert.deepEqual(member!.subjects, ['Français']);
  assert.deepEqual(member!.branches, ['primaire']);
  assert.equal((await call(SUB.bamba, 'get', '/me/help-badge', 200)).body.teamRequests, 0);
  const after = (await call(SUB.bamba, 'get', '/team/invitations', 200)).body.items;
  assert.equal(after.find((i: { code: string }) => i.code === code).uses, 2);
  assert.equal(after.find((i: { code: string }) => i.code === code).state, 'active');
  // Déjà membre : une nouvelle demande est refusée.
  await call(first, 'post', '/team/invitations/redeem', 400, {
    code,
    levels: ['cp1'],
    subjects: ['Français'],
  });
});

test('membre d’une équipe : le profil est fixé, il ne le change plus lui-même', async () => {
  const koffi = (await call(SUB.koffi, 'get', '/me', 200)).body;
  assert.equal(koffi.profileLocked, true);
  const refused = await call(SUB.koffi, 'put', '/me/profiles', 403, { profiles: ['parent'] });
  assert.match(refused.body.message, /fixé par la direction/);
  // Une personne sans équipe choisit toujours ses profils.
  const fresh = 'profil-libre-1';
  assert.equal((await call(fresh, 'get', '/me', 200)).body.profileLocked, false);
  await call(fresh, 'put', '/me/profiles', 200, { profiles: ['parent'] });
});
