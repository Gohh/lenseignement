import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID } from '../src/db/demo-data.js';
import { learningEvents, outboxEvents } from '../src/db/schema.js';
import { drainOutbox, type OutboxEvent } from '../src/events/outbox.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

const ALI = 'apprenant-evt-ali';
const ESI = 'apprenant-evt-esi';
const COURSE = ID.courseAdditions; // publié, 2 leçons avec quiz

async function call(
  subject: string | null,
  method: 'get' | 'post',
  path: string,
  status: number,
  body?: object,
) {
  const server = request(ctx.app.getHttpServer());
  let req = server[method](`/api/v1${path}`);
  if (subject) req = req.set('Authorization', `Bearer ${await ctx.sign({ sub: subject })}`);
  return (body ? req.send(body) : req).expect(status);
}

const send = (subject: string, events: object[], status = 200) =>
  call(subject, 'post', '/learning-events', status, { events });

async function userIdOf(subject: string): Promise<string> {
  return (await call(subject, 'get', '/me', 200)).body.userId;
}

/** Évènements de l'outbox d'une personne, par type. */
async function outboxOf(userId: string): Promise<Record<string, number>> {
  const rows = await ctx.db
    .select({ type: outboxEvents.eventType, n: sql<number>`count(*)::int` })
    .from(outboxEvents)
    .where(sql`${outboxEvents.payload}->>'userId' = ${userId}`)
    .groupBy(outboxEvents.eventType);
  return Object.fromEntries(rows.map((r) => [r.type, r.n]));
}

async function quizQuestion(): Promise<string> {
  const res = await call(null, 'get', `/catalog/courses/${COURSE}/lessons/2`, 200);
  return res.body.quiz[0].id;
}

test('connexion obligatoire et lot validé', async () => {
  await call(null, 'post', '/learning-events', 401, { events: [] });
  await send(ALI, [], 400);
  await send(ALI, [{ operationId: randomUUID(), courseId: COURSE, type: 'inconnu' }], 400);
  await send(ALI, [{ operationId: 'pas-un-id', courseId: COURSE, type: 'enrolled' }], 400);
  const tooMany = Array.from({ length: 51 }, () => ({
    operationId: randomUUID(),
    courseId: COURSE,
    type: 'enrolled',
  }));
  await send(ALI, tooMany, 400);
});

const batch = (questionId: string) => [
  { operationId: randomUUID(), courseId: COURSE, type: 'enrolled' },
  { operationId: randomUUID(), courseId: COURSE, type: 'lesson_opened', lessonNumber: 1 },
  {
    operationId: randomUUID(),
    courseId: COURSE,
    type: 'lesson_completed',
    lessonNumber: 1,
    occurredAt: '2026-10-27T08:00:00Z',
  },
  {
    operationId: randomUUID(),
    courseId: COURSE,
    type: 'quiz_submitted',
    lessonNumber: 2,
    answers: [{ questionId, choice: 1 }],
  },
];

let sent: object[] = [];

test('un lot est appliqué dans l’ordre, avec un évènement métier par changement', async () => {
  sent = batch(await quizQuestion());
  const res = await send(ALI, sent);
  assert.deepEqual(
    res.body.results.map((r: { status: string }) => r.status),
    ['applied', 'applied', 'applied', 'applied'],
  );
  const progress = await call(ALI, 'get', `/me/courses/${COURSE}/progress`, 200);
  assert.deepEqual(progress.body.completed, [1]);
  const latest = await call(
    ALI,
    'get',
    `/me/quiz-attempts/latest?courseId=${COURSE}&lessonNumber=2`,
    200,
  );
  assert.equal(latest.body.attempt.score, 1);
  assert.deepEqual(await outboxOf(await userIdOf(ALI)), {
    AssessmentSubmitted: 1,
    EnrollmentCreated: 1,
    LessonCompleted: 1,
  });
  // L'heure de l'appareil est gardée ; les réponses au quiz ne vont pas dans le journal.
  const logged = await ctx.db.select().from(learningEvents);
  assert.ok(logged.some((e) => e.occurredAt?.toISOString() === '2026-10-27T08:00:00.000Z'));
  assert.ok(!JSON.stringify(logged.map((e) => e.payload)).includes('answers'));
});

test('lot renvoyé (réseau coupé puis rétabli) : rien n’est rejoué', async () => {
  const res = await send(ALI, sent);
  assert.deepEqual(
    res.body.results.map((r: { status: string }) => r.status),
    ['duplicate', 'duplicate', 'duplicate', 'duplicate'],
  );
  const [{ n }] = (
    await ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from quiz_attempts`)
  ).rows as [{ n: number }];
  assert.equal(n, 1);
  assert.deepEqual(await outboxOf(await userIdOf(ALI)), {
    AssessmentSubmitted: 1,
    EnrollmentCreated: 1,
    LessonCompleted: 1,
  });
});

test('même action sous un autre identifiant : pas de second évènement (E2E-08)', async () => {
  const res = await send(ALI, [
    { operationId: randomUUID(), courseId: COURSE, type: 'enrolled' },
    { operationId: randomUUID(), courseId: COURSE, type: 'lesson_completed', lessonNumber: 1 },
  ]);
  assert.deepEqual(
    res.body.results.map((r: { status: string }) => r.status),
    ['applied', 'applied'],
  );
  const counts = await outboxOf(await userIdOf(ALI));
  assert.equal(counts.EnrollmentCreated, 1);
  assert.equal(counts.LessonCompleted, 1);
});

test('action refusée : rien n’en reste, elle peut être renvoyée plus tard', async () => {
  const completed = {
    operationId: randomUUID(),
    courseId: COURSE,
    type: 'lesson_completed',
    lessonNumber: 1,
  };
  const refused = await send(ESI, [
    completed,
    { operationId: randomUUID(), courseId: ID.courseSyllabes, type: 'enrolled' },
  ]);
  assert.deepEqual(refused.body.results, [
    {
      operationId: completed.operationId,
      status: 'rejected',
      message: 'Inscrivez-vous d’abord à ce cours.',
    },
    {
      operationId: refused.body.results[1].operationId,
      status: 'rejected',
      message: 'Cours introuvable.',
    },
  ]);
  const logged = await ctx.db
    .select()
    .from(learningEvents)
    .where(eq(learningEvents.clientOperationId, completed.operationId));
  assert.equal(logged.length, 0);

  const retried = await send(ESI, [
    { operationId: randomUUID(), courseId: COURSE, type: 'enrolled' },
    completed,
  ]);
  assert.deepEqual(
    retried.body.results.map((r: { status: string }) => r.status),
    ['applied', 'applied'],
  );
});

test('identifiants propres à chaque personne', async () => {
  // Le même identifiant d'action chez une autre personne n'est pas un doublon de la première.
  const [enrolled] = sent as Array<{ operationId: string }>;
  const res = await send(ESI, [
    { operationId: enrolled!.operationId, courseId: ID.courseMots, type: 'enrolled' },
  ]);
  assert.equal(res.body.results[0].status, 'applied');
});

test('les routes directes produisent aussi un seul évènement', async () => {
  const subject = 'apprenant-evt-direct';
  await call(subject, 'post', '/enrollments', 201, { courseId: ID.courseNombres });
  await call(subject, 'post', '/enrollments', 201, { courseId: ID.courseNombres });
  await call(subject, 'post', '/me/progress/completed', 201, {
    courseId: ID.courseNombres,
    lessonNumber: 1,
  });
  await call(subject, 'post', '/me/progress/completed', 201, {
    courseId: ID.courseNombres,
    lessonNumber: 1,
  });
  assert.deepEqual(await outboxOf(await userIdOf(subject)), {
    EnrollmentCreated: 1,
    LessonCompleted: 1,
  });
});

test('le journal des actions ne se modifie ni ne se supprime', async () => {
  await assert.rejects(ctx.db.update(learningEvents).set({ payload: {} }));
  await assert.rejects(ctx.db.delete(learningEvents));
});

test('outbox : chaque évènement est délivré une fois, dans l’ordre', async () => {
  const delivered: OutboxEvent[] = [];
  let total = 0;
  for (;;) {
    const { published } = await drainOutbox(ctx.db, async (e) => void delivered.push(e), 5);
    if (published === 0) break;
    total += published;
  }
  const [{ n }] = (
    await ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from outbox_events`)
  ).rows as [{ n: number }];
  assert.equal(total, n);
  assert.equal(new Set(delivered.map((e) => e.id)).size, n);
  const times = delivered.map((e) => e.createdAt.getTime());
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
  assert.deepEqual(await drainOutbox(ctx.db, async () => {}), { published: 0, failed: 0 });
});

test('outbox : un échec est retenté plus tard, sans bloquer les autres', async () => {
  const subject = 'apprenant-evt-echec';
  await call(subject, 'post', '/enrollments', 201, { courseId: ID.courseMots });
  await call(subject, 'post', '/me/progress/completed', 201, {
    courseId: ID.courseMots,
    lessonNumber: 1,
  });
  const failing = async (e: OutboxEvent) => {
    if (e.eventType === 'EnrollmentCreated') throw new Error('destinataire indisponible');
  };
  assert.deepEqual(await drainOutbox(ctx.db, failing), { published: 1, failed: 1 });
  const [pending] = await ctx.db
    .select()
    .from(outboxEvents)
    .where(sql`${outboxEvents.publishedAt} is null`);
  assert.equal(pending!.attempts, 1);
  assert.equal(pending!.lastError, 'destinataire indisponible');
  assert.ok(pending!.availableAt.getTime() > Date.now(), 'nouvelle tentative reportée');
  // Pas encore l'heure : rien à livrer.
  assert.deepEqual(await drainOutbox(ctx.db, async () => {}), { published: 0, failed: 0 });

  await ctx.db
    .update(outboxEvents)
    .set({ availableAt: sql`now()` })
    .where(eq(outboxEvents.id, pending!.id));
  assert.deepEqual(await drainOutbox(ctx.db, async () => {}), { published: 1, failed: 0 });
});

test('outbox : deux travailleurs en même temps ne livrent jamais deux fois', async () => {
  for (const course of [ID.courseNombres, ID.courseMots, COURSE]) {
    await call('apprenant-evt-concurrent', 'post', '/enrollments', 201, { courseId: course });
  }
  const seen: string[] = [];
  const slow = async (e: OutboxEvent) => {
    seen.push(e.id);
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const [a, b] = await Promise.all([drainOutbox(ctx.db, slow, 2), drainOutbox(ctx.db, slow, 2)]);
  assert.equal(a.published + b.published, 3);
  assert.equal(new Set(seen).size, seen.length);
});
