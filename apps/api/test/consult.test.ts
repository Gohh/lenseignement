import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { inArray } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { assignments, evaluations, memberships } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
const granted: string[] = [];
const stamp = `Consult ${Date.now()}`;

before(async () => {
  ctx = await createTestApp();
  const rows = await ctx.db
    .insert(memberships)
    .values([{ userId: ID.userFatou, organizationId: ID.orgRegion, role: 'administrateur' }])
    .returning({ id: memberships.id });
  granted.push(...rows.map((r) => r.id));
  await ctx.db.insert(assignments).values({
    cohortId: ID.cohortCp1A,
    createdByUserId: ID.userKoffi,
    title: `${stamp} devoir`,
    instructions: 'Lire la page 3.',
  });
  await ctx.db.insert(evaluations).values({
    cohortId: ID.cohortCp1A,
    createdByUserId: ID.userKoffi,
    title: `${stamp} contrôle`,
    heldOn: '2026-10-01',
  });
});

after(async () => {
  await ctx.db.delete(memberships).where(inArray(memberships.id, granted));
  await ctx.close();
});

async function get(subject: string, path: string, status: number) {
  const token = await ctx.sign({ sub: subject });
  return request(ctx.app.getHttpServer())
    .get(`/api/v1/admin/consult${path}`)
    .set('authorization', `Bearer ${token}`)
    .expect(status);
}

test('consulter : réservé au superadministrateur et aux administrateurs', async () => {
  await get(SUB.bamba, '/cours', 403);
  await get(SUB.koffi, '/classes', 403);
  await get(SUB.fatou, '/inconnu', 404);
});

test('l’administrateur voit cours, classes, devoirs et évaluations de toute la plateforme', async () => {
  const courses = (await get(SUB.fatou, '/cours', 200)).body.items;
  assert.ok(courses.some((c: { title: string }) => c.title.includes('syllabes')));

  const classes = (await get(SUB.fatou, '/classes?search=CP1', 200)).body.items;
  const cp1a = classes.find((c: { id: string }) => c.id === ID.cohortCp1A);
  assert.ok(cp1a.learners >= 1);
  assert.ok(cp1a.teachers.length >= 1);

  const work = (await get(SUB.fatou, `/devoirs?search=${encodeURIComponent(stamp)}`, 200)).body
    .items;
  assert.equal(work.length, 1);
  assert.equal(work[0].className, 'CP1 A');
  assert.equal(work[0].submitted, 0);

  const evals = (await get(SUB.fatou, `/evaluations?search=${encodeURIComponent(stamp)}`, 200)).body
    .items;
  assert.equal(evals.length, 1);
  assert.equal(evals[0].average, null);
  assert.equal(evals[0].heldOn, '2026-10-01');
});
