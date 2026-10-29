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

const fiche = { region: 'DRENA Essai', locality: 'Bouaké', managerName: 'M. Essai' };
const unique = () => `Essai ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test('création d’établissement : superadmin et administrateur partout, gestionnaire dans sa zone', async () => {
  const made: string[] = [];
  try {
    // Sans rôle de gestion, ou avec la seule direction : refus.
    await call(SUB.koffi, 'post', '/team/organizations', 403, {
      name: unique(),
      type: 'primary_public',
      ...fiche,
    });
    await call(SUB.bamba, 'post', '/team/organizations', 403, {
      name: unique(),
      type: 'primary_public',
      ...fiche,
    });

    // Administrateur : voit tout, crée à la racine ou sous n’importe quelle structure, sans doublon.
    await withRole(ID.userAwa, ID.orgBaobabs, 'administrateur', async () => {
      const team = (await call(SUB.awa, 'get', '/team', 200)).body;
      assert.equal(team.organizations.length, 3);
      assert.equal(team.everywhere, true);
      assert.ok(!team.grantable.includes('chef-etablissement'));
      const name = unique();
      const root = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name,
          type: 'authority',
          ...fiche,
        })
      ).body;
      assert.equal(root.managerCode, null);
      await call(SUB.awa, 'post', '/team/organizations', 400, { name: unique(), type: 'college' });
      made.push(root.id);
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: name.toUpperCase(),
        type: 'authority',
      });
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: 'x',
        type: 'primary_public',
        ...fiche,
      });
      await call(SUB.awa, 'post', '/team/organizations', 400, {
        name: unique(),
        type: 'inconnu',
        ...fiche,
      });
      const child = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name,
          type: 'primary_public',
          ...fiche,
          parentId: root.id,
        })
      ).body;
      made.push(child.id);
    });

    // Superadministrateur : il reçoit le code d'invitation du responsable.
    await withRole(ID.userAwa, ID.orgRegion, 'superadministrateur', async () => {
      const made2 = (
        await call(SUB.awa, 'post', '/team/organizations', 201, {
          name: unique(),
          type: 'lycee',
          ...fiche,
        })
      ).body;
      made.push(made2.id);
      assert.match(made2.managerCode, /^[A-Z2-9]{8}$/);
    });

    // Gestionnaire de Manguiers : sa zone seulement, parent obligatoire.
    await withRole(ID.userYao, ID.orgManguiers, 'gestionnaire', async () => {
      const team = (await call(SUB.yao, 'get', '/team', 200)).body;
      assert.deepEqual(
        team.organizations.map((o: { id: string }) => o.id),
        [ID.orgManguiers],
      );
      assert.equal(team.everywhere, false);
      assert.deepEqual(team.grantable, ['enseignant', 'alphabetiseur', 'referent-pedagogique']);
      await call(SUB.yao, 'post', '/team/organizations', 400, {
        name: unique(),
        type: 'primary_public',
        ...fiche,
      });
      await call(SUB.yao, 'post', '/team/organizations', 403, {
        name: unique(),
        type: 'primary_public',
        ...fiche,
        parentId: ID.orgBaobabs,
      });
      const annex = (
        await call(SUB.yao, 'post', '/team/organizations', 201, {
          name: unique(),
          type: 'primary_public',
          ...fiche,
          parentId: ID.orgManguiers,
        })
      ).body;
      made.push(annex.id);
      const after = (await call(SUB.yao, 'get', '/team', 200)).body;
      assert.ok(after.organizations.some((o: { id: string }) => o.id === annex.id));

      // Il invite un référent dans sa zone, mais ni une direction ni un administrateur, ni hors zone.
      const referent = {
        organizationId: ID.orgManguiers,
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
        organizationId: ID.orgBaobabs,
      });
    });
  } finally {
    await ctx.db
      .delete(membershipInvitations)
      .where(inArray(membershipInvitations.organizationId, made));
    for (const id of made.reverse())
      await ctx.db.delete(organizations).where(eq(organizations.id, id));
  }
});

test('import CSV : aperçu sans rien écrire, puis création ; une erreur bloque tout', async () => {
  const a = unique();
  const b = unique();
  const csv = `nom officiel;type;direction régionale;localité;responsable;structure parente\n${a};primaire public;DRENA Essai;Bouaké;M. Essai;\n${b};Centre d’alphabétisation;DRENA Essai;Bouaké;M. Essai;${a}\n`;
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

    const bad = `nom officiel,type,direction régionale,localité,responsable,parent\n${a},truc,R,L,Rep,\nab,collège,R,L,Rep,\n${a},collège,R,L,Rep,Inconnue\n`;
    const errors = (
      await call(SUB.awa, 'post', '/team/organizations/import', 201, { csv: bad, confirm: false })
    ).body;
    assert.deepEqual(
      errors.lines.map((l: { status: string }) => l.status),
      ['error', 'error', 'error'],
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
  // Nettoyage : l’enfant d’abord.
  for (const name of [b, a]) {
    await ctx.db.delete(organizations).where(eq(organizations.name, name));
  }
  // Un gestionnaire ne crée que sous sa zone.
  await withRole(ID.userYao, ID.orgManguiers, 'gestionnaire', async () => {
    const c = unique();
    const out = `nom officiel;type;direction régionale;localité;responsable;structure parente\n${c};collège;DRENA Essai;Bouaké;M. Essai;\n${c};collège;DRENA Essai;Bouaké;M. Essai;École primaire Les Baobabs (fictive)\n`;
    const lines = (
      await call(SUB.yao, 'post', '/team/organizations/import', 201, { csv: out, confirm: false })
    ).body.lines;
    assert.deepEqual(
      lines.map((l: { status: string }) => l.status),
      ['error', 'error'],
    );
  });
  await call(SUB.koffi, 'post', '/team/organizations/import', 403, { csv, confirm: false });
});
