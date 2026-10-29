import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
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

test('l’enseignant programme une séance, les élèves de la classe la voient avec le lien de visio', async () => {
  const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const input = {
    title: 'Les fractions',
    subject: 'Mathématiques',
    startsAt: soon,
    durationMinutes: 45,
  };

  // Seuls l'enseignant de la classe ou la direction programment ; les données sont contrôlées.
  await call(SUB.awa, 'post', `/cohorts/${ID.cohortCp1A}/sessions`, 404, input);
  await call(SUB.aminata, 'post', `/cohorts/${ID.cohortCp1A}/sessions`, 404, input);
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/sessions`, 400, {
    ...input,
    durationMinutes: 5,
  });
  await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/sessions`, 400, {
    ...input,
    startsAt: 'demain',
  });
  const { id } = (await call(SUB.koffi, 'post', `/cohorts/${ID.cohortCp1A}/sessions`, 201, input))
    .body;

  const awa = (await call(SUB.awa, 'get', '/me/class-sessions', 200)).body.items;
  const seen = awa.find((s: { id: string }) => s.id === id);
  assert.equal(seen.title, 'Les fractions');
  assert.equal(seen.canManage, false);
  assert.match(seen.joinUrl, /^https:\/\/meet\.jit\.si\/lenseignement-[0-9a-f]{16}$/);

  // Une autre classe ne voit rien ; la direction de l'école gère.
  const other = (await call(SUB.aminata, 'get', '/me/class-sessions', 200)).body.items;
  assert.ok(!other.some((s: { id: string }) => s.id === id));
  const director = (await call(SUB.bamba, 'get', '/me/class-sessions', 200)).body.items;
  assert.equal(director.find((s: { id: string }) => s.id === id).canManage, true);

  // Après la séance : résumé et support. Un élève ne modifie rien.
  await call(SUB.awa, 'patch', `/class-sessions/${id}`, 404, { summary: 'Non' });
  await call(SUB.koffi, 'patch', `/class-sessions/${id}`, 400, {
    resourceUrl: 'javascript:alert(1)',
  });
  await call(SUB.koffi, 'patch', `/class-sessions/${id}`, 200, {
    summary: 'La moitié, le quart.',
    resourceUrl: 'https://exemple.test/fiche.pdf',
  });
  const after = (await call(SUB.awa, 'get', '/me/class-sessions', 200)).body.items.find(
    (s: { id: string }) => s.id === id,
  );
  assert.equal(after.summary, 'La moitié, le quart.');
  assert.equal(after.resourceUrl, 'https://exemple.test/fiche.pdf');

  await call(SUB.awa, 'delete', `/class-sessions/${id}`, 404);
  await call(SUB.koffi, 'delete', `/class-sessions/${id}`, 200);
  const gone = (await call(SUB.awa, 'get', '/me/class-sessions', 200)).body.items;
  assert.ok(!gone.some((s: { id: string }) => s.id === id));
});
