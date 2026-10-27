import type { INestApplication } from '@nestjs/common';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { createTestApp } from './helpers.js';

let app: INestApplication;

before(async () => {
  ({ app } = await createTestApp());
});

after(async () => {
  await app.close();
});

test('GET /api/v1/health répond ok', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  assert.equal(res.body.status, 'ok');
});

test('GET /api/v1/catalog/branches liste les cinq branches', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/catalog/branches').expect(200);
  assert.equal(res.body.items.length, 5);
});

test('une branche inconnue renvoie 404 au format d’erreur stable', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/v1/catalog/branches/inconnue')
    .set('x-request-id', 'trace-test')
    .expect(404);
  assert.deepEqual(res.body, {
    code: 'not_found',
    message: 'Branche inconnue.',
    trace_id: 'trace-test',
  });
});

test('les en-têtes de sécurité sont présents', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/health');
  assert.ok(res.headers['strict-transport-security']);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('une configuration invalide est refusée', () => {
  assert.throws(() => loadConfig({ API_PORT: 'abc' }), /Configuration invalide/);
});

test('un émetteur OIDC non HTTPS est refusé en production', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', OIDC_ISSUER_URL: 'http://idp.local/realms/x' }),
    /HTTPS/,
  );
});
