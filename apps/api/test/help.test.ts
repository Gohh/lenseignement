import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { memberships } from '../src/db/schema.js';
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
  method: 'get' | 'post',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('une question de l’apprenant arrive à l’enseignant de sa classe, qui y répond', async () => {
  await call(SUB.awa, 'post', '/me/help-questions', 400, { kind: 'stuck', body: ' ' });
  const { id } = (
    await call(SUB.awa, 'post', '/me/help-questions', 201, {
      kind: 'not_understood',
      body: 'Je ne comprends pas la moitié.',
    })
  ).body;

  const mine = (await call(SUB.awa, 'get', '/me/help-questions', 200)).body.items;
  assert.equal(mine[0].status, 'open');

  // Koffi enseigne à sa classe : il voit la question et la cloche l'annonce.
  const inbox = (await call(SUB.koffi, 'get', '/help/inbox', 200)).body.items;
  assert.ok(inbox.some((q: { id: string }) => q.id === id));
  assert.ok((await call(SUB.koffi, 'get', '/me/help-badge', 200)).body.questions >= 1);

  // Aminata enseigne à une autre classe : ni la voir, ni y répondre.
  const other = (await call(SUB.aminata, 'get', '/help/inbox', 200)).body.items;
  assert.ok(!other.some((q: { id: string }) => q.id === id));
  await call(SUB.aminata, 'post', `/help/questions/${id}/answer`, 403, { answer: 'Non.' });
  // Un élève ne répond pas à sa propre question.
  await call(SUB.awa, 'post', `/help/questions/${id}/answer`, 403, { answer: 'Moi.' });

  await call(SUB.koffi, 'post', `/help/questions/${id}/answer`, 201, {
    answer: 'La moitié, c’est partager en deux parts égales.',
  });
  await call(SUB.koffi, 'post', `/help/questions/${id}/answer`, 400, { answer: 'Encore.' });

  // La cloche de l'apprenant s'allume, puis s'éteint quand il a lu.
  assert.equal((await call(SUB.awa, 'get', '/me/help-badge', 200)).body.answers, 1);
  const answered = (await call(SUB.awa, 'get', '/me/help-questions', 200)).body.items[0];
  assert.equal(answered.status, 'answered');
  assert.equal(answered.unseen, true);
  await call(SUB.awa, 'post', '/me/help-questions/seen', 201);
  assert.equal((await call(SUB.awa, 'get', '/me/help-badge', 200)).body.answers, 0);
});

test('un élève sans classe : la question est vue par un administrateur de la plateforme', async () => {
  const { id } = (
    await call('apprenant-sans-classe', 'post', '/me/help-questions', 201, {
      kind: 'other',
      body: 'Personne ne me connaît encore.',
    })
  ).body;
  // Koffi n'enseigne pas à cet élève.
  const koffi = (await call(SUB.koffi, 'get', '/help/inbox', 200)).body.items;
  assert.ok(!koffi.some((q: { id: string }) => q.id === id));
  // Un superadministrateur voit et répond.
  await ctx.db
    .insert(memberships)
    .values({ userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' })
    .onConflictDoNothing();
  try {
    const admin = (await call(SUB.yao, 'get', '/help/inbox', 200)).body.items;
    assert.ok(admin.some((q: { id: string }) => q.id === id));
    await call(SUB.yao, 'post', `/help/questions/${id}/answer`, 201, { answer: 'Bienvenue !' });
  } finally {
    await ctx.db
      .delete(memberships)
      .where(and(eq(memberships.userId, ID.userYao), eq(memberships.role, 'superadministrateur')));
  }
});
