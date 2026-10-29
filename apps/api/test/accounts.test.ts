import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships, users } from '../src/db/schema.js';
import {
  IdentityError,
  KeycloakAdmin,
  temporaryPassword,
  type IdentityAdmin,
} from '../src/team/identity-admin.js';
import { createTestApp, type TestContext } from './helpers.js';

const created: Array<{ email: string; firstName: string; lastName: string; password: string }> = [];
const fake: IdentityAdmin = {
  configured: () => true,
  async createUser(input) {
    if (input.email === 'deja@exemple.test')
      throw new IdentityError('exists', 'Un compte existe déjà avec cet e-mail.');
    created.push({
      email: input.email ?? '',
      firstName: input.firstName,
      lastName: input.lastName,
      password: input.temporaryPassword,
    });
    return { id: randomUUID() };
  },
};

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp({ identityAdmin: fake });
});

after(async () => {
  await ctx.close();
});

async function post(subject: string, path: string, status: number, body: object) {
  const token = await ctx.sign({ sub: subject });
  return request(ctx.app.getHttpServer())
    .post(`/api/v1${path}`)
    .set('authorization', `Bearer ${token}`)
    .send(body)
    .expect(status);
}

const base = {
  displayName: 'Marie Kouassi',
  email: 'marie.kouassi@exemple.test',
  organizationId: ID.orgManguiers,
  role: 'enseignant',
  branches: null,
};

test('la direction crée le compte d’un enseignant : mot de passe provisoire, fiche et rôle', async () => {
  const res = (await post(SUB.bamba, '/team/accounts', 201, base)).body;
  assert.equal(res.email, 'marie.kouassi@exemple.test');
  assert.equal(res.role, 'enseignant');
  assert.ok(res.temporaryPassword.length >= 12);
  assert.equal(created[0]?.firstName, 'Marie');
  assert.equal(created[0]?.lastName, 'Kouassi');
  assert.equal(created[0]?.password, res.temporaryPassword);

  const [member] = await ctx.db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(users.displayName, 'Marie Kouassi'), eq(memberships.role, 'enseignant')));
  assert.ok(member);
});

test('mêmes droits qu’une invitation : pas de direction pour la direction, rien pour un enseignant', async () => {
  await post(SUB.bamba, '/team/accounts', 403, {
    ...base,
    email: 'x@exemple.test',
    role: 'chef-etablissement',
  });
  await post(SUB.koffi, '/team/accounts', 403, { ...base, email: 'y@exemple.test' });
  await post(SUB.bamba, '/team/accounts', 400, { ...base, displayName: 'Marie' });
  await post(SUB.bamba, '/team/accounts', 400, { ...base, email: 'pas-un-mail' });
  const dup = (
    await post(SUB.bamba, '/team/accounts', 400, { ...base, email: 'deja@exemple.test' })
  ).body;
  assert.match(dup.message, /existe déjà/);
});

test('statut : la création de comptes est signalée comme configurée', async () => {
  const token = await ctx.sign({ sub: SUB.bamba });
  const res = await request(ctx.app.getHttpServer())
    .get('/api/v1/team/accounts/status')
    .set('authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(res.body.configured, true);
});

test('Keycloak : non configuré, compte existant, création réussie', async () => {
  const noSecret = new KeycloakAdmin({ issuerUrl: 'http://kc/realms/r', clientId: 'c' });
  assert.equal(noSecret.configured(), false);
  const input = {
    username: 'a@b.test',
    email: 'a@b.test',
    firstName: 'A',
    lastName: 'B',
    temporaryPassword: 'Xyz-1234-ab',
  };
  await assert.rejects(noSecret.createUser(input), { kind: 'not_configured' });

  const calls: string[] = [];
  const make = (status: number): typeof fetch =>
    (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).endsWith('/token')) {
        return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
      }
      return new Response('', {
        status,
        headers: status === 201 ? { location: 'http://kc/admin/realms/r/users/abc-123' } : {},
      });
    }) as typeof fetch;
  const options = { issuerUrl: 'http://kc/realms/r', clientId: 'c', clientSecret: 's' };
  await assert.rejects(new KeycloakAdmin({ ...options, fetchImpl: make(409) }).createUser(input), {
    kind: 'exists',
  });
  const ok = await new KeycloakAdmin({ ...options, fetchImpl: make(201) }).createUser(input);
  assert.equal(ok.id, 'abc-123');
  assert.ok(calls.includes('http://kc/admin/realms/r/users'));
  assert.match(temporaryPassword(), /^[A-Z][a-z]{3}-\d{4}-[a-z]{2}[A-Z]\d$/);
});
