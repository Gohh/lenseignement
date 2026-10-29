import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships, users } from '../src/db/schema.js';
import { IdentityError, type IdentityAdmin } from '../src/team/identity-admin.js';
import { createTestApp, type TestContext } from './helpers.js';

const deleted: string[] = [];
const fake: IdentityAdmin = {
  configured: () => true,
  async createUser(input) {
    if (input.email === 'deja@exemple.test') {
      throw new IdentityError('exists', 'Un compte existe déjà avec cet e-mail.');
    }
    return { id: randomUUID() };
  },
  async deleteUser(id) {
    deleted.push(id);
  },
};

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp({ identityAdmin: fake });
  await ctx.db.insert(memberships).values([
    { userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' },
    { userId: ID.userMariam, organizationId: ID.orgRegion, role: 'administrateur' },
  ]);
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

const csv = [
  'Nom;Prénom;E-mail;Rôle;Établissement',
  'Kouassi;Marie;marie.k@exemple.test;Enseignant ou formateur;École primaire Les Manguiers (fictive)',
  'Traoré;Ali;ali.t@exemple.test;gestionnaire;ecole primaire les manguiers (fictive)',
  'Koné;Awa;pas-un-mail;enseignant;École primaire Les Manguiers (fictive)',
  'Bamba;Yves;yves@exemple.test;Cuisinier;École primaire Les Manguiers (fictive)',
  'Diallo;Fanta;fanta@exemple.test;enseignant;École inconnue',
  'Yao;Kofi;deja@exemple.test;enseignant;École primaire Les Manguiers (fictive)',
].join('\n');

test('import : les lignes valides sont créées, les autres expliquées', async () => {
  await call(SUB.bamba, 'post', '/admin/accounts/import', 403, { csv });
  const res = (await call(SUB.yao, 'post', '/admin/accounts/import', 201, { csv })).body;
  assert.deepEqual(
    res.created.map((c: { displayName: string; role: string }) => [c.displayName, c.role]),
    [
      ['Marie Kouassi', 'enseignant'],
      ['Ali Traoré', 'gestionnaire'],
    ],
  );
  assert.ok(res.created[0].temporaryPassword);
  assert.deepEqual(
    res.failed.map((f: { line: number; reason: string }) => [f.line, f.reason]),
    [
      [4, 'Adresse e-mail invalide : « pas-un-mail ».'],
      [5, 'Rôle inconnu : « Cuisinier ».'],
      [6, 'Établissement introuvable : « École inconnue ».'],
      [7, 'Un compte existe déjà avec cet e-mail.'],
    ],
  );
  const bad = (await call(SUB.yao, 'post', '/admin/accounts/import', 400, { csv: 'a;b\n1;2' }))
    .body;
  assert.match(bad.message, /Nom ; Prénom ; E-mail/);
});

test('modifier un compte : nom, profils et niveau', async () => {
  await call(SUB.mariam, 'patch', `/admin/accounts/${ID.userAwa}`, 204, {
    displayName: 'Awa Koné Diallo',
    profiles: ['apprenant'],
    level: 'cp2',
  });
  const [awa] = await ctx.db.select().from(users).where(eq(users.id, ID.userAwa));
  assert.equal(awa!.displayName, 'Awa Koné Diallo');
  assert.equal(awa!.level, 'cp2');
  await call(SUB.mariam, 'patch', `/admin/accounts/${ID.userYao}`, 403, {
    displayName: 'Yao',
    profiles: [],
    level: null,
  });
  await call(SUB.bamba, 'patch', `/admin/accounts/${ID.userAwa}`, 403, {
    displayName: 'X Y',
    profiles: [],
    level: null,
  });
});

test('supprimer : seulement un compte jamais utilisé, et aussi dans Keycloak', async () => {
  const [marie] = await ctx.db
    .select({ id: users.id, subject: users.oidcSubject })
    .from(users)
    .where(eq(users.displayName, 'Marie Kouassi'));
  const res = (await call(SUB.yao, 'delete', `/admin/accounts/${marie!.id}`, 200)).body;
  assert.equal(res.removedFromKeycloak, true);
  assert.deepEqual(deleted, [marie!.subject]);
  assert.equal((await ctx.db.select().from(users).where(eq(users.id, marie!.id))).length, 0);

  // Koffi s'est déjà connecté : on le suspend, on ne le supprime pas.
  await call(SUB.koffi, 'get', '/me', 200);
  const used = (await call(SUB.yao, 'delete', `/admin/accounts/${ID.userKoffi}`, 400)).body;
  assert.match(used.message, /déjà servi/);
  await call(SUB.yao, 'delete', `/admin/accounts/${ID.userYao}`, 400);
  await call(SUB.mariam, 'delete', `/admin/accounts/${ID.userYao}`, 403);
});
