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

test('messages : la mère écrit à l’enseignant de sa fille, il répond, la cloche suit', async () => {
  // Fatou (parent d’Awa) peut écrire à M. Koffi, pas à une autre enseignante.
  const contacts = (await call(SUB.fatou, 'get', '/me/message-contacts', 200)).body.items;
  const koffi = contacts.find((c: { otherUserId: string }) => c.otherUserId === ID.userKoffi);
  assert.ok(koffi, 'Koffi doit être joignable');
  assert.equal(koffi.otherRole, 'enseignant');
  assert.ok(!contacts.some((c: { otherUserId: string }) => c.otherUserId === ID.userAminata));

  // Un élève, ou un enseignant d’une autre classe, ne peut pas ouvrir cet échange.
  await call(SUB.aminata, 'post', '/conversations', 404, {
    learnerId: koffi.learnerId,
    otherUserId: ID.userFatou,
    body: 'Bonjour',
  });
  await call(SUB.fatou, 'post', '/conversations', 404, {
    learnerId: koffi.learnerId,
    otherUserId: ID.userAminata,
    body: 'Bonjour',
  });
  await call(SUB.fatou, 'post', '/conversations', 400, {
    learnerId: koffi.learnerId,
    otherUserId: ID.userKoffi,
    body: '  ',
  });

  const { id } = (
    await call(SUB.fatou, 'post', '/conversations', 201, {
      learnerId: koffi.learnerId,
      otherUserId: ID.userKoffi,
      body: 'Bonjour, Awa a manqué la classe hier.',
    })
  ).body;

  // Le même trio réutilise la conversation.
  const again = (
    await call(SUB.fatou, 'post', '/conversations', 201, {
      learnerId: koffi.learnerId,
      otherUserId: ID.userKoffi,
      body: 'Merci d’avance.',
    })
  ).body;
  assert.equal(again.id, id);

  // La cloche de l’enseignant annonce 2 messages ; personne d’autre ne peut ouvrir la conversation.
  assert.equal((await call(SUB.koffi, 'get', '/me/help-badge', 200)).body.messages, 2);
  await call(SUB.aminata, 'get', `/conversations/${id}`, 404);
  await call(SUB.awa, 'get', `/conversations/${id}`, 404);
  await call(SUB.aminata, 'post', `/conversations/${id}/messages`, 404, { body: 'Intrus' });

  const opened = (await call(SUB.koffi, 'get', `/conversations/${id}`, 200)).body;
  assert.equal(opened.messages.length, 2);
  assert.equal(opened.messages[0].mine, false);
  assert.equal((await call(SUB.koffi, 'get', '/me/help-badge', 200)).body.messages, 0);

  await call(SUB.koffi, 'post', `/conversations/${id}/messages`, 201, {
    body: 'Merci de m’avoir prévenu.',
  });
  assert.equal((await call(SUB.fatou, 'get', '/me/help-badge', 200)).body.messages, 1);
  const list = (await call(SUB.fatou, 'get', '/me/conversations', 200)).body.items;
  assert.equal(list.find((c: { id: string }) => c.id === id).unread, 1);
});
