import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.app.close();
});

const me = () => request(ctx.app.getHttpServer()).get('/api/v1/me');

test('GET /me sans jeton : 401 au format stable', async () => {
  const res = await me().expect(401);
  assert.equal(res.body.code, 'unauthorized');
  assert.equal(res.body.message, 'Authentification requise.');
});

test('GET /me avec un jeton valide renvoie le sujet et les rôles', async () => {
  const token = await ctx.sign({ sub: 'eleve-42', roles: ['apprenant'] });
  const res = await me().set('authorization', `Bearer ${token}`).expect(200);
  assert.deepEqual(res.body, { subject: 'eleve-42', roles: ['apprenant'] });
});

test('les rôles non textuels du jeton sont ignorés', async () => {
  const token = await ctx.sign({ roles: ['enseignant', 42, { admin: true }] });
  const res = await me().set('authorization', `Bearer ${token}`).expect(200);
  assert.deepEqual(res.body.roles, ['enseignant']);
});

const rejected: Array<[string, () => Promise<string>]> = [
  ['expiré', () => ctx.sign({}, { expiresIn: '-1m' })],
  ['mauvais émetteur', () => ctx.sign({}, { issuer: 'https://autre-idp.test/realms/x' })],
  ['mauvaise audience', () => ctx.sign({}, { audience: 'autre-api' })],
  ['signé par une clé inconnue', () => ctx.signWithForeignKey()],
  [
    'non signé (alg none)',
    async () => {
      const [, payload] = (await ctx.sign()).split('.');
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      return `${header}.${payload}.`;
    },
  ],
  ['malformé', async () => 'pas-un-jwt'],
];

for (const [label, makeToken] of rejected) {
  test(`GET /me avec un jeton ${label} : 401`, async () => {
    const res = await me()
      .set('authorization', `Bearer ${await makeToken()}`)
      .expect(401);
    assert.equal(res.body.message, 'Jeton invalide ou expiré.');
  });
}

test('un schéma autre que Bearer est refusé', async () => {
  await me().set('authorization', 'Basic dXNlcjpwYXNz').expect(401);
});

test('les routes publiques restent accessibles sans jeton', async () => {
  await request(ctx.app.getHttpServer()).get('/api/v1/catalog/branches').expect(200);
  await request(ctx.app.getHttpServer()).get('/api/v1/health').expect(200);
});
