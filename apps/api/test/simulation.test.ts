import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { practiceRequests, safetySimulations, simulationAttempts } from '../src/db/schema.js';
import { DEMO_SIMULATION as CODE } from '../src/simulation/demo-simulation.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

// Apprenants inconnus du jeu de démonstration : chacun part de zéro.
const ALI = 'apprenant-atelier-ali';
const BINTA = 'apprenant-atelier-binta';
const ZOE = 'apprenant-atelier-zoe';

async function call(
  subject: string | null,
  method: 'get' | 'post',
  path: string,
  status: number,
  body?: object,
) {
  const server = request(ctx.app.getHttpServer());
  let req = server[method](`/api/v1/me/simulations/${CODE}${path}`);
  if (subject) req = req.set('Authorization', `Bearer ${await ctx.sign({ sub: subject })}`);
  return (body ? req.send(body) : req).expect(status);
}

/** Bonnes réponses de la simulation de démonstration. */
const RIGHT = [
  { stepId: 'materiel', choices: [1, 0, 1] },
  { stepId: 'epi', choices: [0, 1, 2] },
  { stepId: 'consignation', choices: [1, 4, 2, 0, 3] },
];

const attempt = (subject: string, steps = RIGHT, attemptId = randomUUID()) =>
  call(subject, 'post', '/attempts', 200, { attemptId, steps });

test('la simulation suit le référentiel métier 2026, sans le corrigé', async () => {
  await call(null, 'get', '', 401);
  const res = await call(ALI, 'get', '', 200);
  assert.deepEqual(res.body.simulation, {
    code: CODE,
    title: 'Atelier virtuel : mettre un circuit en sécurité (démonstration)',
    curriculum: { code: 'DEMO-ELEC', label: '2026' },
    competency: { code: 'SECU-02', title: 'Consigner une installation avant intervention' },
    practice: { code: 'INST-01', title: "Câbler un circuit d'éclairage simple" },
  });
  assert.deepEqual(
    res.body.steps.map((s: { kind: string; id: string }) => `${s.kind}:${s.id}`),
    ['identify:materiel', 'equipment:epi', 'order:consignation'],
  );
  const text = JSON.stringify(res.body.steps);
  for (const secret of ['correct', 'required', 'explanation']) assert.ok(!text.includes(secret));
  assert.equal(res.body.lastAttempt, null);
  assert.deepEqual(res.body.practice, { status: 'locked', requestedAt: null });
  await request(ctx.app.getHttpServer())
    .get('/api/v1/me/simulations/INCONNU')
    .set('Authorization', `Bearer ${await ctx.sign({ sub: ALI })}`)
    .expect(404);
});

test('E2E-05 : séance pratique bloquée sans simulation réussie, avec ce qu’il faut revoir', async () => {
  // Sans essai : refus.
  const none = await call(ALI, 'post', '/practice-request', 409);
  assert.equal(
    none.body.message,
    'Réussis d’abord la simulation de sécurité : la séance pratique reste bloquée.',
  );

  // Essai avec erreurs : VAT et travail inversés, montre gardée, gants oubliés.
  const failed = await attempt(ALI, [
    { stepId: 'materiel', choices: [1, 0, 1] },
    { stepId: 'epi', choices: [1, 2, 3] },
    { stepId: 'consignation', choices: [1, 4, 2, 3, 0] },
  ]);
  assert.equal(failed.body.lastAttempt.passed, false);
  assert.deepEqual(
    failed.body.lastAttempt.steps.map((s: { stepId: string; passed: boolean }) => [
      s.stepId,
      s.passed,
    ]),
    [
      ['materiel', true],
      ['epi', false],
      ['consignation', false],
    ],
  );
  assert.deepEqual(failed.body.lastAttempt.steps[1].feedback, [
    'Il manque : Gants isolants. Les gants isolants protègent tes mains du courant.',
    'À laisser : Montre ou bracelet en métal. Le métal conduit le courant : on enlève montre, bague et bracelet.',
  ]);
  assert.deepEqual(failed.body.lastAttempt.steps[2].feedback, [
    '« Vérifier l’absence de tension avec le VAT » est le 4e geste. On vérifie l’absence de tension juste avant de travailler : c’est la seule preuve que le circuit est coupé.',
    '« Commencer le travail, sous le regard du formateur » est le 5e geste. On ne commence qu’à la fin, une fois tout vérifié, et jamais seul.',
  ]);
  assert.equal(failed.body.practice.status, 'locked');
  await call(ALI, 'post', '/practice-request', 409);

  // Réussi : la séance s'ouvre, la demande est enregistrée une seule fois.
  const passed = await attempt(ALI);
  assert.equal(passed.body.lastAttempt.passed, true);
  assert.ok(passed.body.lastAttempt.steps.every((s: { feedback: string[] }) => !s.feedback.length));
  assert.equal(passed.body.attempts, 2);
  assert.equal(passed.body.practice.status, 'unlocked');
  const asked = await call(ALI, 'post', '/practice-request', 200);
  assert.equal(asked.body.practice.status, 'requested');
  const again = await call(ALI, 'post', '/practice-request', 200);
  assert.equal(again.body.practice.requestedAt, asked.body.practice.requestedAt);
  const { rows } = await ctx.db.execute<{ n: number }>(
    sql`select count(*)::int as n from practice_requests r join users u on u.id = r.user_id
         where u.oidc_subject = ${ALI}`,
  );
  assert.equal(rows[0]!.n, 1);
});

test('un nouvel essai raté rebloque la séance tant qu’elle n’est pas demandée', async () => {
  await attempt(BINTA);
  const failed = await attempt(BINTA, [
    { stepId: 'materiel', choices: [0, 0, 1] },
    ...RIGHT.slice(1),
  ]);
  assert.equal(failed.body.practice.status, 'locked');
  assert.match(failed.body.lastAttempt.steps[0].feedback[0], /^Quel appareil montre/);
  await call(BINTA, 'post', '/practice-request', 409);
});

test('essai renvoyé : enregistré une fois, et à son auteur seulement ; réponses incomplètes refusées', async () => {
  const attemptId = randomUUID();
  const first = await attempt(ZOE, RIGHT, attemptId);
  const replay = await attempt(ZOE, RIGHT, attemptId);
  assert.equal(replay.body.attempts, 1);
  assert.equal(replay.body.lastAttempt.submittedAt, first.body.lastAttempt.submittedAt);
  const stolen = await call(ALI, 'post', '/attempts', 409, { attemptId, steps: RIGHT });
  assert.equal(stolen.body.message, 'Essai déjà enregistré.');

  const bad = (steps: object[]) =>
    call(ZOE, 'post', '/attempts', 400, { attemptId: randomUUID(), steps });
  await bad(RIGHT.slice(1));
  await bad([...RIGHT, RIGHT[0]!]);
  await bad([RIGHT[0]!, RIGHT[1]!, { stepId: 'consignation', choices: [1, 1, 2, 0, 3] }]);
  await bad([{ stepId: 'materiel', choices: [1, 0] }, ...RIGHT.slice(1)]);
  await bad([RIGHT[0]!, { stepId: 'epi', choices: [0, 0] }, RIGHT[2]!]);
});

test('la base refuse une séance sans essai réussi, et rien ne se réécrit', async () => {
  const [simulation] = await ctx.db.select().from(safetySimulations);
  const [failedAttempt] = await ctx.db
    .select()
    .from(simulationAttempts)
    .where(eq(simulationAttempts.passed, false))
    .limit(1);
  await assert.rejects(
    ctx.db.insert(practiceRequests).values({
      userId: failedAttempt!.userId,
      simulationId: simulation!.id,
      attemptId: failedAttempt!.id,
    }),
  );
  await assert.rejects(ctx.db.update(safetySimulations).set({ title: 'autre' }));
  await assert.rejects(ctx.db.update(simulationAttempts).set({ passed: true }));
  await assert.rejects(ctx.db.delete(simulationAttempts));
  await assert.rejects(ctx.db.delete(practiceRequests));
});
