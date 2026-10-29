import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { assignments, cohortMembers, evaluationScores, evaluations } from '../src/db/schema.js';
import { followReasons } from '../src/direction/direction.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

async function get(subject: string, path: string, status: number) {
  const token = await ctx.sign({ sub: subject });
  return request(ctx.app.getHttpServer())
    .get(`/api/v1${path}`)
    .set('authorization', `Bearer ${token}`)
    .expect(status);
}

const DAY = 24 * 60 * 60 * 1000;

test('raisons de suivre un élève : inactivité, moyenne basse, devoirs non rendus', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const joinedAt = new Date(now.getTime() - 60 * DAY);
  assert.deepEqual(
    followReasons(
      { lastActivity: new Date(now.getTime() - DAY), joinedAt, average: 14, missing: 0 },
      now,
    ),
    [],
  );
  assert.deepEqual(
    followReasons({ lastActivity: null, joinedAt, average: 8.25, missing: 3 }, now),
    ['Aucune activité depuis son arrivée (60 jours)', 'Moyenne 8,3/20', '3 devoirs non rendus'],
  );
  assert.deepEqual(
    followReasons(
      { lastActivity: new Date(now.getTime() - 20 * DAY), joinedAt, average: null, missing: 1 },
      now,
    ),
    ['Pas d’activité depuis 20 jours'],
  );
});

test('la direction voit ses classes, leurs chiffres et les élèves à suivre', async () => {
  // Awa est dans la classe depuis un mois : deux devoirs échus non rendus et une note basse.
  await ctx.db
    .update(cohortMembers)
    .set({ createdAt: new Date(Date.now() - 30 * DAY) })
    .where(and(eq(cohortMembers.cohortId, ID.cohortCp1A), eq(cohortMembers.userId, ID.userAwa)));
  for (const title of ['Devoir 1', 'Devoir 2']) {
    await ctx.db.insert(assignments).values({
      cohortId: ID.cohortCp1A,
      createdByUserId: ID.userKoffi,
      title,
      instructions: 'Faire l’exercice.',
      dueAt: new Date(Date.now() - 2 * DAY),
    });
  }
  const [evaluation] = await ctx.db
    .insert(evaluations)
    .values({
      cohortId: ID.cohortCp1A,
      createdByUserId: ID.userKoffi,
      title: 'Contrôle',
      heldOn: '2026-10-20',
      maxScore: 10,
    })
    .returning({ id: evaluations.id });
  await ctx.db
    .insert(evaluationScores)
    .values({ evaluationId: evaluation!.id, learnerUserId: ID.userAwa, score: 3 });

  const res = (await get(SUB.bamba, '/direction/overview', 200)).body;
  assert.equal(res.organization.id, ID.orgManguiers);
  assert.ok(res.schoolYear);
  const cp1a = res.classes.find((c: { id: string }) => c.id === ID.cohortCp1A);
  assert.equal(cp1a.learnerCount, 3);
  assert.equal(cp1a.assignmentCount, 2);
  assert.equal(cp1a.average, 6);
  assert.ok(cp1a.teachers.length >= 1);
  const awa = res.toFollow.find((l: { userId: string }) => l.userId === ID.userAwa);
  assert.ok(awa.reasons.includes('Moyenne 6/20'));
  assert.ok(awa.reasons.includes('2 devoirs non rendus'));
  assert.equal(awa.cohortName, cp1a.name);
  assert.ok(res.totals.toFollow >= 1);
  // Les classes d'un autre établissement n'y sont pas.
  assert.ok(!res.classes.some((c: { id: string }) => c.id === ID.cohortCe1Baobabs));
});

test('l’enseignant n’y a pas accès ; un autre établissement est refusé', async () => {
  await get(SUB.koffi, '/direction/overview', 403);
  await get(SUB.bamba, `/direction/overview?organizationId=${ID.orgBaobabs}`, 404);
  await get(SUB.bamba, '/direction/overview?schoolYear=2026', 400);
});
