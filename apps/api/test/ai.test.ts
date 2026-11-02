import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { aiSettings, exercises, memberships } from '../src/db/schema.js';
import { parseProposals } from '../src/ai/ai.js';
import { createTestApp, type TestContext } from './helpers.js';

// IA de la Fabrique : un faux serveur « modèle libre » (même format qu'Ollama) répond à la
// place d'un vrai fournisseur ; on vérifie ce qui part et ce qui revient.

let ctx: TestContext;
let fake: Server;
let fakeUrl = '';
const received: Array<{
  auth?: string;
  body: { model: string; messages: Array<{ content: string }> };
}> = [];
let reply: unknown = null;

before(async () => {
  process.env.AI_KEY_SECRET = 'secret-de-test-ia';
  ctx = await createTestApp();
  await ctx.db
    .insert(memberships)
    .values([{ userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' }]);
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(reply ?? { ok: true }) } }],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
});

after(async () => {
  await ctx.db.delete(exercises).where(eq(exercises.organizationId, ID.orgManguiers));
  await new Promise((resolve) => fake.close(resolve));
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'put',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

test('réglages de l’IA : réservés au superadministrateur, clé chiffrée et jamais renvoyée', async () => {
  await call(SUB.koffi, 'get', '/admin/ai', 403);
  await call(SUB.koffi, 'put', '/admin/ai', 403, { enabled: false, provider: 'mistral' });
  const first = (await call(SUB.yao, 'get', '/admin/ai', 200)).body;
  assert.equal(first.enabled, false);
  assert.equal(first.hasKey, false);

  // Allumer un fournisseur payant sans clé : refusé.
  await call(SUB.yao, 'put', '/admin/ai', 400, { enabled: true, provider: 'mistral' });
  const saved = (
    await call(SUB.yao, 'put', '/admin/ai', 200, {
      enabled: false,
      provider: 'mistral',
      apiKey: 'sk-tres-secrete-1234',
    })
  ).body;
  assert.equal(saved.hasKey, true);
  assert.equal(saved.keyHint, '1234');
  assert.equal(JSON.stringify(saved).includes('sk-tres'), false);
  const [row] = await ctx.db.select().from(aiSettings);
  assert.ok(row?.apiKeyCipher && !row.apiKeyCipher.includes('secrete'));

  // Garder la clé quand le champ reste vide ; la retirer sur demande.
  const kept = (
    await call(SUB.yao, 'put', '/admin/ai', 200, { enabled: false, provider: 'anthropic' })
  ).body;
  assert.equal(kept.hasKey, true);
  const removed = (
    await call(SUB.yao, 'put', '/admin/ai', 200, {
      enabled: false,
      provider: 'mistral',
      removeKey: true,
    })
  ).body;
  assert.equal(removed.hasKey, false);
});

test('IA éteinte : la Fabrique le dit et ne propose rien', async () => {
  const status = (await call(SUB.koffi, 'get', '/authoring/ai', 200)).body;
  assert.equal(status.enabled, false);
  const comps = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body;
  await call(SUB.koffi, 'post', '/authoring/ai/exercises', 409, {
    organizationId: ID.orgManguiers,
    competencyId: comps.items[0].id,
    domain: 'nombres-operations',
    difficulty: 'facile',
    skill: 'appliquer',
    kind: 'number',
  });
});

test('IA branchée (modèle libre) : propositions en brouillon, sans donnée d’élève, limite du jour', async () => {
  await call(SUB.yao, 'put', '/admin/ai', 200, {
    enabled: true,
    provider: 'local',
    model: 'modele-test',
    baseUrl: fakeUrl,
    apiKey: 'cle-locale',
    dailyLimit: 2,
  });
  const ping = (await call(SUB.yao, 'post', '/admin/ai/test', 200)).body;
  assert.equal(ping.ok, true);
  assert.equal(received.at(-1)?.auth, 'Bearer cle-locale');

  const status = (await call(SUB.koffi, 'get', '/authoring/ai', 200)).body;
  assert.equal(status.enabled, true);
  assert.equal(status.remaining, 2);

  const comp = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body
    .items[0];
  reply = {
    exercices: [
      {
        title: 'Partager des oranges',
        content: {
          prompt: 'Kouassi partage 15 oranges entre 5 amis. Combien chacun ?',
          answer: 3,
          tolerance: 0,
          unit: 'oranges',
          explanation: '15 divisé par 5 font 3.',
        },
      },
      { title: 'Sans réponse', content: { prompt: 'Combien ?' } },
    ],
  };
  const body = {
    organizationId: ID.orgManguiers,
    competencyId: comp.id,
    domain: 'nombres-operations',
    difficulty: 'facile',
    skill: 'appliquer',
    kind: 'number',
    count: 2,
    notes: 'Thème : le marché.',
  };
  // L'élève n'a pas accès à la Fabrique.
  await call(SUB.awa, 'post', '/authoring/ai/exercises', 403, body);
  const result = (await call(SUB.koffi, 'post', '/authoring/ai/exercises', 200, body)).body;
  assert.equal(result.created, 1);
  assert.equal(result.errors.length, 1);
  const [made] = await ctx.db.select().from(exercises).where(eq(exercises.id, result.ids[0]));
  assert.equal(made?.status, 'draft');
  assert.equal(made?.kind, 'number');
  assert.equal(made?.competencyId, comp.id);

  // Ce qui est parti : la fiche de la compétence et les précisions, pas de nom d'élève.
  const sent = JSON.stringify(received.at(-1)?.body);
  assert.equal(received.at(-1)?.body.model, 'modele-test');
  assert.ok(sent.includes(comp.code) && sent.includes('le marché'));
  for (const learner of ['Kouamé', 'Aya', 'Awa']) assert.equal(sent.includes(learner), false);

  // Deux demandes par jour : la troisième est refusée.
  await call(SUB.koffi, 'post', '/authoring/ai/exercises', 200, body);
  await call(SUB.koffi, 'post', '/authoring/ai/exercises', 409, body);
  const after = (await call(SUB.yao, 'get', '/admin/ai', 200)).body;
  assert.equal(after.usedToday, 2);
});

test('lecture des réponses de l’IA : avec ou sans bloc de code', () => {
  assert.equal(parseProposals('```json\n{"exercices":[{"title":"a"}]}\n```').length, 1);
  assert.equal(parseProposals('Voici : [{"title":"a"},{"title":"b"}]').length, 2);
  assert.equal(parseProposals('pas de json').length, 0);
});
