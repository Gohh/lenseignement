import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { workshops } from '../src/db/schema.js';
import { displayOrder } from '../src/workshops/workshops.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.db.delete(workshops).where(eq(workshops.title, 'Rien à garder (fictif)'));
  await ctx.close();
});

async function call(
  subject: string,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  status: number,
  body?: object,
) {
  const token = await ctx.sign({ sub: subject });
  const server = request(ctx.app.getHttpServer());
  const req = server[method](`/api/v1${path}`).set('authorization', `Bearer ${token}`);
  return (body ? req.send(body) : req).expect(status);
}

const STEPS = [
  {
    kind: 'identify',
    title: 'Reconnaître l’outil',
    instructions: '',
    questions: [
      {
        prompt: 'Quel outil sert à serrer les écrous de roue ?',
        choices: ['Un tournevis', 'Une clé en croix'],
        correct: 1,
        explanation: 'La clé en croix donne assez de force.',
      },
    ],
  },
  {
    kind: 'equipment',
    title: 'S’équiper',
    instructions: 'Coche ce qu’il faut.',
    options: [
      { label: 'Gants', needed: true, explanation: 'Protègent les mains.' },
      { label: 'Gilet fluorescent', needed: true, explanation: '' },
      { label: 'Sandales', needed: false, explanation: 'Les pieds doivent être protégés.' },
    ],
  },
  {
    kind: 'order',
    title: 'Changer la roue',
    instructions: '',
    gestures: [
      { label: 'Caler le véhicule', explanation: 'Il ne doit pas bouger.' },
      { label: 'Desserrer les écrous', explanation: 'Roue au sol, elle ne tourne pas.' },
      { label: 'Lever avec le cric', explanation: 'Une fois les écrous débloqués.' },
      { label: 'Changer la roue', explanation: 'Enfin.' },
    ],
  },
];

const FORM = {
  trade: 'mecanique',
  title: 'Changer une roue (fictif)',
  summary: 'Les gestes sûrs pour changer une roue.',
  competencyId: null,
  practice: true,
  steps: STEPS,
};

test('l’ordre affiché des gestes n’est jamais le bon ordre', () => {
  for (let n = 2; n <= 8; n++) {
    const shown = displayOrder(n);
    assert.deepEqual([...shown].sort(), [...Array(n).keys()]);
    assert.notDeepEqual(shown, [...Array(n).keys()]);
  }
});

test('circuit d’un atelier : brouillon, relecture, publication, puis l’élève le fait', async () => {
  // Les structures où l'enseignant peut rédiger ; un élève n'en a aucune.
  const orgs = (await call(SUB.koffi, 'get', '/authoring/workshops/organizations', 200)).body;
  assert.ok(orgs.items.some((o: { id: string }) => o.id === ID.orgManguiers));
  assert.deepEqual((await call(SUB.awa, 'get', '/authoring/workshops/organizations', 200)).body, {
    items: [],
  });
  await call(SUB.awa, 'post', '/authoring/workshops', 403, {
    organizationId: ID.orgManguiers,
    trade: 'mecanique',
    title: 'Interdit',
  });

  const { id } = (
    await call(SUB.koffi, 'post', '/authoring/workshops', 201, {
      organizationId: ID.orgManguiers,
      trade: 'mecanique',
      title: 'Changer une roue (fictif)',
    })
  ).body;

  // Un brouillon vide ne part pas en relecture ; une étape incomplète est refusée.
  await call(SUB.koffi, 'post', `/authoring/workshops/${id}/submit`, 400);
  const bad = await call(SUB.koffi, 'put', `/authoring/workshops/${id}`, 400, {
    ...FORM,
    steps: [{ ...STEPS[1], options: [{ label: 'Gants', needed: false, explanation: '' }] }],
  });
  assert.equal(bad.body.message, 'Au moins deux équipements.');

  const saved = (await call(SUB.koffi, 'put', `/authoring/workshops/${id}`, 200, FORM)).body;
  assert.equal(saved.stepCount, 3);
  assert.equal(saved.canPublish, false);
  await call(SUB.koffi, 'post', `/authoring/workshops/${id}/submit`, 204);
  await call(SUB.koffi, 'put', `/authoring/workshops/${id}`, 409, FORM);

  // L'auteur ne se publie pas ; la direction renvoie avec une remarque, puis publie.
  await call(SUB.koffi, 'post', `/authoring/workshops/${id}/publish`, 403);
  const queue = (await call(SUB.bamba, 'get', '/authoring/workshops', 200)).body.items;
  const mine = queue.find((w: { id: string }) => w.id === id);
  assert.equal(mine.status, 'review');
  assert.equal(mine.canPublish, true);
  await call(SUB.bamba, 'post', `/authoring/workshops/${id}/return`, 204, {
    note: 'Ajoute le gilet dans la consigne.',
  });
  const back = (await call(SUB.koffi, 'get', `/authoring/workshops/${id}`, 200)).body;
  assert.equal(back.status, 'draft');
  assert.equal(back.reviewNote, 'Ajoute le gilet dans la consigne.');
  await call(SUB.koffi, 'post', `/authoring/workshops/${id}/submit`, 204);
  await call(SUB.bamba, 'post', `/authoring/workshops/${id}/publish`, 204);

  const published = (await call(SUB.koffi, 'get', `/authoring/workshops/${id}`, 200)).body;
  assert.equal(published.status, 'published');
  assert.equal(published.reviewNote, null);
  assert.match(published.liveCode, /^ATELIER-.*-V1$/);
  await call(SUB.koffi, 'delete', `/authoring/workshops/${id}`, 409);

  // L'élève le trouve dans son catalogue, sans le corrigé, gestes mélangés.
  const learner = `apprenant-atelier-${randomUUID()}`;
  const me = (await call(learner, 'get', '/me', 200)).body;
  assert.equal(me.workshopLearner, false);
  assert.equal(me.workshopAuthor, false);
  const card = (await call(learner, 'get', '/me/workshops', 200)).body.items.find(
    (c: { code: string }) => c.code === published.liveCode,
  );
  assert.deepEqual(card, {
    code: published.liveCode,
    title: 'Changer une roue (fictif)',
    trade: 'mecanique',
    summary: 'Les gestes sûrs pour changer une roue.',
    stepCount: 3,
    practice: true,
    progress: 'todo',
  });
  const sim = (await call(learner, 'get', `/me/simulations/${published.liveCode}`, 200)).body;
  assert.equal(sim.simulation.trade, 'mecanique');
  assert.equal(sim.simulation.curriculum, null);
  const order = sim.steps[2];
  assert.notDeepEqual(
    order.gestures,
    STEPS[2]!.gestures!.map((g) => g.label),
  );
  assert.ok(!JSON.stringify(sim.steps).includes('correct'));

  // Bonnes réponses : gestes remis dans l'ordre juste à partir de l'ordre affiché.
  const right = STEPS[2]!.gestures!.map((g) => order.gestures.indexOf(g.label));
  const done = (
    await call(learner, 'post', `/me/simulations/${published.liveCode}/attempts`, 200, {
      attemptId: randomUUID(),
      steps: [
        { stepId: 'etape-1', choices: [1] },
        { stepId: 'etape-2', choices: [0, 1] },
        { stepId: 'etape-3', choices: right },
      ],
    })
  ).body;
  assert.equal(done.lastAttempt.passed, true);
  assert.equal(done.practice.status, 'unlocked');
  assert.equal((await call(learner, 'get', '/me', 200)).body.workshopLearner, true);

  // Nouveau brouillon : la version en ligne reste, et l'avancement suit l'atelier.
  await call(SUB.koffi, 'post', `/authoring/workshops/${id}/reopen`, 204);
  await call(SUB.koffi, 'put', `/authoring/workshops/${id}`, 200, { ...FORM, practice: false });
  await call(SUB.koffi, 'post', `/authoring/workshops/${id}/submit`, 204);
  await call(SUB.mariam, 'post', `/authoring/workshops/${id}/publish`, 204);
  const v2 = (await call(learner, 'get', '/me/workshops', 200)).body.items.find(
    (c: { title: string }) => c.title === 'Changer une roue (fictif)',
  );
  assert.match(v2.code, /-V2$/);
  assert.equal(v2.progress, 'passed');
  assert.equal(v2.practice, false);
  const none = (await call(learner, 'get', `/me/simulations/${v2.code}`, 200)).body;
  assert.equal(none.practice.status, 'none');

  // Retiré : il quitte le catalogue ; seul un publieur le retire.
  await call(SUB.koffi, 'post', `/authoring/workshops/${id}/archive`, 403);
  await call(SUB.bamba, 'post', `/authoring/workshops/${id}/archive`, 204);
  const after = (await call(learner, 'get', '/me/workshops', 200)).body.items;
  assert.ok(!after.some((c: { title: string }) => c.title === 'Changer une roue (fictif)'));
  await call(SUB.bamba, 'post', `/authoring/workshops/${id}/restore`, 204);
});

test('un brouillon jamais publié se supprime ; une autre structure ne le voit pas', async () => {
  const { id } = (
    await call(SUB.koffi, 'post', '/authoring/workshops', 201, {
      organizationId: ID.orgManguiers,
      trade: 'couture',
      title: 'Rien à garder (fictif)',
    })
  ).body;
  await call(SUB.yao, 'get', `/authoring/workshops/${id}`, 404);
  await call(SUB.koffi, 'delete', `/authoring/workshops/${id}`, 204);
  await call(SUB.koffi, 'get', `/authoring/workshops/${id}`, 404);
});
