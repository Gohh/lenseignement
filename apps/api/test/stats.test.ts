import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { mask, percent } from '../src/stats/stats.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

async function overview(subject: string | null, status: number) {
  let req = request(ctx.app.getHttpServer()).get('/api/v1/stats/overview');
  if (subject) req = req.set('Authorization', `Bearer ${await ctx.sign({ sub: subject })}`);
  return req.expect(status);
}

test('seuil de confidentialité : 1 à 4 personnes masquées, pourcentages sur 5 au moins', () => {
  assert.equal(mask(0), 0);
  assert.equal(mask(1), null);
  assert.equal(mask(4), null);
  assert.equal(mask(5), 5);
  assert.equal(percent(3, 4, 4), null);
  assert.equal(percent(5, 8, 8), 63);
  assert.equal(percent(0, 0, 9), null);
});

test('réservé à la direction et aux référents ; refus uniforme et journalisé', async () => {
  await overview(null, 401);
  for (const subject of [SUB.koffi, SUB.awa, SUB.fatou, SUB.yao]) {
    const res = await overview(subject, 403);
    assert.equal(res.body.message, 'Accès refusé.');
  }
  const { rows } = await ctx.db.execute<{ n: number }>(sql`
    select count(*)::int as n from audit_logs where action = 'stats.read' and decision = 'deny'`);
  assert.equal(rows[0]!.n, 4);
});

test('le directeur voit les chiffres de son école, sans aucun nom', async () => {
  const res = await overview(SUB.bamba, 200);
  assert.equal(res.body.threshold, 5);
  assert.deepEqual(res.body.organizations, ['École primaire Les Manguiers (fictive)']);
  const additions = res.body.courses.find(
    (c: { courseId: string }) => c.courseId === ID.courseAdditions,
  );
  // 12 élèves fictifs : 10 commencent, 7 terminent ; quiz : 23 bonnes réponses sur 27.
  assert.deepEqual(additions, {
    courseId: ID.courseAdditions,
    title: 'Additionner jusqu’à 10 (démonstration)',
    branch: 'primaire',
    enrolled: 12,
    started: 10,
    completed: 7,
    active7: 12,
    active30: 12,
    quizSuccess: 85,
  });
  // Bilan : 8 orientés, 5 rattrapages terminés, 3 en cours (masqué).
  assert.deepEqual(res.body.remediation, {
    diagnosed: 8,
    inProgress: null,
    completed: 5,
    effectiveRate: 63,
  });
  assert.deepEqual(res.body.workshop, { tried: 8, passed: 6, requested: 5 });
  const text = JSON.stringify(res.body);
  for (const secret of ['Élève fictif', 'Awa', 'Koffi', '40000000-0000', 'seed:']) {
    assert.ok(!text.includes(secret), `${secret} ne doit pas apparaître`);
  }
});

test('un petit groupe est masqué', async () => {
  const token = await ctx.sign({ sub: SUB.awa });
  await request(ctx.app.getHttpServer())
    .post('/api/v1/enrollments')
    .set('Authorization', `Bearer ${token}`)
    .send({ courseId: ID.courseNombres })
    .expect((res) => assert.ok(res.status < 300, String(res.status)));
  const res = await overview(SUB.bamba, 200);
  const nombres = res.body.courses.find(
    (c: { courseId: string }) => c.courseId === ID.courseNombres,
  );
  assert.equal(nombres.enrolled, null);
  assert.equal(nombres.active7, null);
  assert.equal(nombres.quizSuccess, null);
});

test('la référente régionale voit toutes les structures de sa région', async () => {
  const res = await overview(SUB.mariam, 200);
  assert.deepEqual(res.body.organizations, [
    'Direction régionale de démonstration (fictive)',
    'École primaire Les Baobabs (fictive)',
    'École primaire Les Manguiers (fictive)',
  ]);
  assert.equal(res.body.workshop.tried, 8);
});

test('le superadministrateur voit les chiffres de toutes les structures', async () => {
  const [row] = (
    await ctx.db.execute<{ id: string }>(sql`
      insert into memberships (user_id, organization_id, role)
      values (${ID.userYao}, ${ID.orgRegion}, 'superadministrateur') returning id`)
  ).rows;
  try {
    const res = await overview(SUB.yao, 200);
    assert.ok(res.body.organizations.includes('École primaire Les Manguiers (fictive)'));
  } finally {
    await ctx.db.execute(sql`delete from memberships where id = ${row!.id}`);
  }
});
