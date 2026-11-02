import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { cohorts, memberships, oralCampaigns, oralResults, oralTests } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

// Campagnes orales de zone (étape 5b) : lancer, les enseignants font passer dans leurs classes,
// résultats de zone anonymes à la clôture (à partir de 5 élèves), résultat figé ensuite.

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
  await ctx.db
    .insert(memberships)
    .values([{ userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' }]);
  await ctx.db
    .update(cohorts)
    .set({ level: 'cp1' })
    .where(inArray(cohorts.id, [ID.cohortCp1A, ID.cohortCp1B]));
});

after(async () => {
  const tests = ctx.db
    .select({ id: oralTests.id })
    .from(oralTests)
    .where(like(oralTests.title, '%(test campagne orale)%'));
  await ctx.db.delete(oralResults).where(inArray(oralResults.testId, tests));
  await ctx.db.delete(oralCampaigns).where(inArray(oralCampaigns.testId, tests));
  await ctx.db.delete(oralTests).where(like(oralTests.title, '%(test campagne orale)%'));
  await ctx.db.execute(
    sql`delete from cohort_members where user_id in (select id from users where oidc_subject like 'test-oral-%')`,
  );
  await ctx.db.execute(sql`delete from users where oidc_subject like 'test-oral-%'`);
  await ctx.db
    .update(cohorts)
    .set({ level: null })
    .where(inArray(cohorts.id, [ID.cohortCp1A, ID.cohortCp1B]));
  await ctx.db
    .delete(memberships)
    .where(and(eq(memberships.userId, ID.userYao), eq(memberships.role, 'superadministrateur')));
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

const blank = { errors: [], last: null, seconds: 0, stopped: false, answers: [] };
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test('campagne orale : lancer, faire passer, clore, résultats anonymes', async () => {
  const { id: testId } = (
    await call(SUB.koffi, 'post', '/oral/tests', 201, {
      organizationId: ID.orgManguiers,
      title: 'Lecture (test campagne orale)',
      subject: 'lecture',
      level: 'cp1',
      model: 'lecture-debut',
    })
  ).body;
  await call(SUB.bamba, 'post', `/oral/tests/${testId}/publish`, 204);

  // L'enseignant ne lance pas ; le superadministrateur lance pour tout le pays.
  const input = {
    testId,
    title: 'Lecture CP1 (test campagne orale)',
    zoneId: null,
    level: 'cp1',
    startsAt: day(0),
    endsAt: day(5),
  };
  await call(SUB.koffi, 'post', '/oral/campaigns', 403, input);
  const options = (await call(SUB.yao, 'get', '/oral/campaigns/options', 200)).body;
  assert.ok(options.tests.some((t: { id: string }) => t.id === testId));
  const { id, classes } = (await call(SUB.yao, 'post', '/oral/campaigns', 201, input)).body;
  assert.ok(classes >= 2);

  // L'enseignant la voit dans ses évaluations orales, avec sa classe seulement.
  const overview = (await call(SUB.koffi, 'get', '/oral', 200)).body;
  const mine = overview.campaigns.find((c: { id: string }) => c.id === id);
  assert.deepEqual(
    mine.myClasses.map((c: { cohortId: string }) => c.cohortId),
    [ID.cohortCp1A],
  );
  assert.equal((await call(SUB.koffi, 'get', '/me', 200)).body.campaigns, true);

  // Deux élèves de plus pour atteindre 5 évalués dans la campagne.
  const extra: string[] = [];
  for (let i = 0; i < 2; i += 1) {
    const [u] = (
      await ctx.db.execute<{ id: string }>(
        sql`insert into users (oidc_subject, display_name) values (${`test-oral-${randomUUID()}`}, 'Élève (test oral)') returning id`,
      )
    ).rows;
    await ctx.db.execute(
      sql`insert into cohort_members (cohort_id, user_id, role) values (${ID.cohortCp1A}, ${u!.id}, 'apprenant')`,
    );
    extra.push(u!.id);
  }
  const pass = (who: string, learnerId: string, cohortId: string, last: number | null) =>
    call(who, 'post', '/oral/results', 200, {
      operationId: randomUUID(),
      testId,
      cohortId,
      learnerId,
      parts: [blank, blank, blank, { ...blank, last, seconds: 60 }],
    });
  await pass(SUB.koffi, ID.userAwa, ID.cohortCp1A, 39);
  await pass(SUB.koffi, ID.learnerKouame, ID.cohortCp1A, 19);
  await pass(SUB.koffi, ID.learnerAya, ID.cohortCp1A, null);
  await pass(SUB.koffi, extra[0]!, ID.cohortCp1A, 29);
  await pass(SUB.aminata, ID.learnerSeydou, ID.cohortCp1B, 9);

  // Pendant la campagne : participation seulement.
  const detail = (await call(SUB.yao, 'get', `/oral/campaigns/${id}`, 200)).body;
  assert.equal(detail.evaluated, 5);
  assert.equal(detail.status, 'en-cours');
  await call(SUB.yao, 'get', `/oral/campaigns/${id}/results`, 400);
  await call(SUB.yao, 'delete', `/oral/campaigns/${id}`, 409);
  await call(SUB.koffi, 'post', `/oral/campaigns/${id}/close`, 403);
  await call(SUB.yao, 'post', `/oral/campaigns/${id}/close`, 204);

  const results = (await call(SUB.yao, 'get', `/oral/campaigns/${id}/results`, 200)).body;
  assert.equal(results.scope, 'campagne');
  assert.equal(results.evaluated, 5);
  // Par minute sur le petit texte : 40, 20, 0, 30, 10.
  assert.equal(results.median, 20);
  assert.equal(results.zeroRate, 20);
  assert.equal(results.reference.title, 'Petit texte');
  const manguiers = results.schools.find((s: { id: string }) => s.id === ID.orgManguiers);
  assert.equal(manguiers.evaluated, 5);
  assert.equal(manguiers.median, 20);
  assert.ok(!JSON.stringify(results).includes('Awa'));

  // La direction de l'école lit sa part ; le résultat de campagne close ne se remplace plus.
  const school = (await call(SUB.bamba, 'get', `/oral/campaigns/${id}/results`, 200)).body;
  assert.equal(school.scope, 'ma-zone');
  // Moins de 5 élèves évalués : aucun chiffre, seulement le nombre d'élèves évalués.
  await ctx.db.execute(
    sql`update oral_results set campaign_id = null where campaign_id = ${id} and learner_id = ${ID.learnerSeydou}`,
  );
  const fewer = (await call(SUB.yao, 'get', `/oral/campaigns/${id}/results`, 200)).body;
  assert.equal(fewer.evaluated, 4);
  assert.equal(fewer.median, null);
  assert.deepEqual(fewer.bands, []);
  await call(SUB.koffi, 'post', '/oral/results', 409, {
    operationId: randomUUID(),
    testId,
    cohortId: ID.cohortCp1A,
    learnerId: ID.userAwa,
    parts: [blank, blank, blank, blank],
  });
  const stats = (await call(SUB.yao, 'get', '/oral/campaigns/stats', 200)).body;
  assert.ok(stats.items.some((c: { id: string }) => c.id === id));
});
