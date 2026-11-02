import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { and, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import {
  assignments,
  cohorts,
  examCampaigns,
  exams,
  exercises,
  memberships,
} from '../src/db/schema.js';
import { createTestApp, type TestContext } from './helpers.js';

// Campagnes d'évaluation de zone (étape 4c-1) : lancer dans sa zone, toutes les classes du niveau
// reçoivent l'épreuve, l'élève la voit à la date de début, la note reste cachée jusqu'à la clôture.

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
  await ctx.db.insert(memberships).values([
    { userId: ID.userYao, organizationId: ID.orgRegion, role: 'superadministrateur' },
    { userId: ID.userMariam, organizationId: ID.orgRegion, role: 'gestionnaire' },
  ]);
  await ctx.db.update(cohorts).set({ level: 'cp1' }).where(eq(cohorts.id, ID.cohortCp1A));
});

after(async () => {
  await ctx.db.delete(examCampaigns).where(like(examCampaigns.title, '%(test campagne)%'));
  await ctx.db.delete(assignments).where(isNotNull(assignments.examId));
  await ctx.db.delete(exams).where(like(exams.title, '%(test campagne)%'));
  await ctx.db.delete(exercises).where(like(exercises.title, '%(test campagne)%'));
  await ctx.db.execute(
    sql`delete from cohort_members where user_id in (select id from users where oidc_subject like 'test-campagne-%')`,
  );
  await ctx.db.execute(sql`delete from users where oidc_subject like 'test-campagne-%'`);
  await ctx.db.update(cohorts).set({ level: null }).where(eq(cohorts.id, ID.cohortCp1A));
  await ctx.db
    .delete(memberships)
    .where(
      and(
        inArray(memberships.userId, [ID.userYao, ID.userMariam]),
        inArray(memberships.role, ['superadministrateur', 'gestionnaire']),
      ),
    );
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

async function published(title: string): Promise<string> {
  const comp = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body
    .items[0];
  const fiche = {
    competencyId: comp.id,
    domain: 'geometrie-espace',
    difficulty: 'moyen',
    skill: 'appliquer',
  };
  const { id } = (
    await call(SUB.koffi, 'post', '/authoring/exercises', 201, {
      ...fiche,
      organizationId: ID.orgManguiers,
      kind: 'truefalse',
      title,
    })
  ).body;
  await call(SUB.koffi, 'put', `/authoring/exercises/${id}`, 200, {
    ...fiche,
    title,
    content: { kind: 'truefalse', explanation: '', media: null, prompt: title, correct: true },
  });
  await call(SUB.koffi, 'post', `/authoring/exercises/${id}/submit`, 204);
  await call(SUB.bamba, 'post', `/authoring/exercises/${id}/publish`, 204);
  return id;
}

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test('campagne : lancée dans la zone, passée par les élèves, notes cachées jusqu’à la clôture', async () => {
  for (const n of [1, 2, 3, 4]) await published(`Figure ${n} (test campagne)`);
  const comp = (await call(SUB.koffi, 'get', '/authoring/exercises/competencies', 200)).body
    .items[0];
  const exam = (
    await call(SUB.koffi, 'post', '/authoring/exams', 201, {
      organizationId: ID.orgManguiers,
      curriculumVersionId: comp.curriculumId,
      model: 'libre',
      title: 'Géométrie CP1 (test campagne)',
      shares: { 'geometrie-espace': 100 },
      questionCount: 4,
      durationMinutes: 20,
      threshold: 50,
    })
  ).body;

  // Un élève, un enseignant ne lancent pas de campagne.
  assert.deepEqual((await call(SUB.awa, 'get', '/authoring/campaigns/options', 200)).body, {
    zones: [],
    exams: [],
  });
  const launch = {
    examId: exam.id,
    title: 'Évaluation CP1 (test campagne)',
    zoneId: ID.orgRegion,
    level: 'cp1',
    startsAt: day(1),
    endsAt: day(8),
  };
  await call(SUB.koffi, 'post', '/authoring/campaigns', 403, launch);

  // Le gestionnaire voit sa DRENA et l'épreuve de l'une de ses écoles.
  const options = (await call(SUB.mariam, 'get', '/authoring/campaigns/options', 200)).body;
  assert.ok(options.zones.some((z: { id: string }) => z.id === ID.orgRegion));
  assert.ok(!options.zones.some((z: { id: string | null }) => z.id === null));
  assert.ok(options.exams.some((e: { id: string }) => e.id === exam.id));
  const preview = (
    await call(
      SUB.mariam,
      'get',
      `/authoring/campaigns/preview?zone=${ID.orgRegion}&level=cp1`,
      200,
    )
  ).body;
  assert.deepEqual(preview.classes, 1);
  // Tout le pays : réservé à l'administration et aux directions centrales.
  await call(SUB.mariam, 'post', '/authoring/campaigns', 403, { ...launch, zoneId: null });
  await call(SUB.mariam, 'post', '/authoring/campaigns', 400, { ...launch, endsAt: day(0) });

  // Campagne de demain : l'élève ne la voit pas encore.
  const later = (await call(SUB.mariam, 'post', '/authoring/campaigns', 201, launch)).body;
  assert.equal(later.classes, 1);
  const awaItems = async () =>
    (await call(SUB.awa, 'get', '/me/assignments', 200)).body.items as Array<{
      id: string;
      title: string;
      resultsAt: string | null;
      mine: { score: number | null } | null;
    }>;
  assert.ok(!(await awaItems()).some((a) => a.title === launch.title));
  const laterDetail = (await call(SUB.koffi, 'get', `/authoring/campaigns/${later.id}`, 200)).body;
  assert.equal(laterDetail.canPilot, false);
  assert.equal(laterDetail.status, 'a-venir');
  assert.equal(laterDetail.myClasses.length, 1);
  const laterAssignment = laterDetail.myClasses[0].assignmentId;
  await call(SUB.awa, 'get', `/assignments/${laterAssignment}/work`, 404);
  await call(SUB.awa, 'post', `/assignments/${laterAssignment}/answers`, 400, {
    attemptId: randomUUID(),
    answers: [{ choices: [0] }, { choices: [0] }, { choices: [0] }, { choices: [0] }],
  });
  // L'école choisit le papier pour sa classe ; la saisie attend le début.
  await call(
    SUB.koffi,
    'put',
    `/authoring/campaigns/${later.id}/classes/${ID.cohortCp1A}/mode`,
    204,
    {
      onPaper: true,
    },
  );
  const sheet = (
    await call(
      SUB.koffi,
      'get',
      `/authoring/campaigns/${later.id}/paper?cohort=${ID.cohortCp1A}`,
      200,
    )
  ).body;
  assert.equal(sheet.onPaper, true);
  await call(SUB.koffi, 'put', `/authoring/campaigns/${later.id}/paper`, 400, {
    cohortId: ID.cohortCp1A,
    rows: [],
  });
  // Le livret est lisible par l'école, pas par l'élève.
  const booklet = (await call(SUB.koffi, 'get', `/authoring/campaigns/${later.id}/booklet`, 200))
    .body;
  assert.equal(booklet.items.length, 4);
  await call(SUB.awa, 'get', `/authoring/campaigns/${later.id}`, 404);
  await call(SUB.awa, 'get', `/authoring/campaigns/${later.id}/booklet`, 404);
  // Une campagne sans copie se supprime.
  await call(SUB.koffi, 'delete', `/authoring/campaigns/${later.id}`, 404);
  await call(SUB.mariam, 'delete', `/authoring/campaigns/${later.id}`, 204);

  // Campagne nationale ouverte aujourd'hui : l'élève la fait, la note reste cachée.
  const now = (
    await call(SUB.yao, 'post', '/authoring/campaigns', 201, {
      ...launch,
      title: 'Évaluation nationale CP1 (test campagne)',
      zoneId: null,
      startsAt: day(0),
    })
  ).body;
  const mineBefore = (await awaItems()).find((a) => a.title.startsWith('Évaluation nationale'));
  assert.ok(mineBefore?.resultsAt);
  const answered = (
    await call(SUB.awa, 'post', `/assignments/${mineBefore.id}/answers`, 200, {
      attemptId: randomUUID(),
      answers: [{ choices: [0] }, { choices: [0] }, { choices: [1] }, { choices: [0] }],
    })
  ).body;
  assert.equal(answered.score, null);
  assert.deepEqual(answered.results ?? [], []);
  assert.equal((await awaItems()).find((a) => a.id === mineBefore.id)?.mine?.score, null);

  // L'enseignant suit la participation, sans la note ; le mode ne change plus.
  const detail = (await call(SUB.koffi, 'get', `/authoring/campaigns/${now.id}`, 200)).body;
  assert.equal(detail.status, 'en-cours');
  assert.equal(detail.myClasses[0].submitted, 1);
  await call(
    SUB.koffi,
    'put',
    `/authoring/campaigns/${now.id}/classes/${ID.cohortCp1A}/mode`,
    400,
    {
      onPaper: true,
    },
  );
  const review = (await call(SUB.koffi, 'get', `/assignments/${mineBefore.id}/review`, 200)).body;
  assert.ok(
    review.rows.every(
      (r: { submission: { score: number | null } | null }) => r.submission?.score == null,
    ),
  );
  // Le pilote voit les écoles, regroupées par DRENA.
  const pilot = (await call(SUB.yao, 'get', `/authoring/campaigns/${now.id}`, 200)).body;
  assert.equal(pilot.canPilot, true);
  assert.equal(pilot.groupLabel, 'DRENA');
  assert.ok(pilot.schools.some((s: { submitted: number }) => s.submitted === 1));
  const listed = (await call(SUB.yao, 'get', '/authoring/campaigns', 200)).body;
  assert.equal(listed.canLaunch, true);
  assert.ok(listed.piloted.some((c: { id: string }) => c.id === now.id));
  assert.ok(
    (await call(SUB.koffi, 'get', '/authoring/campaigns', 200)).body.classes.some(
      (c: { id: string }) => c.id === now.id,
    ),
  );
  assert.equal((await call(SUB.koffi, 'get', '/me', 200)).body.campaigns, true);

  // Résultats : rien avant la clôture. Cinq autres copies pour dépasser le seuil d'anonymat.
  await call(SUB.yao, 'get', `/authoring/campaigns/${now.id}/results`, 400);
  const items = (
    await ctx.db.execute<{ exercise_id: string }>(
      sql`select exercise_id from exam_items where exam_id = ${exam.id} order by position`,
    )
  ).rows;
  for (let i = 0; i < 5; i++) {
    const [u] = (
      await ctx.db.execute<{ id: string }>(
        sql`insert into users (oidc_subject, display_name) values (${`test-campagne-${randomUUID()}`}, 'Élève (test campagne)') returning id`,
      )
    ).rows;
    await ctx.db.execute(
      sql`insert into cohort_members (cohort_id, user_id, role) values (${ID.cohortCp1A}, ${u!.id}, 'apprenant')`,
    );
    const results = items.map((it, k) => ({
      exerciseId: it.exercise_id,
      title: '',
      correct: k < 2,
      score: k < 2 ? 1 : 0,
      feedback: [],
    }));
    await ctx.db.execute(
      sql`insert into assignment_submissions (assignment_id, learner_user_id, body, score, results)
          values (${mineBefore.id}, ${u!.id}, '', 50, ${JSON.stringify(results)}::jsonb)`,
    );
  }

  // Avec des copies, elle ne se supprime plus ; clôturée, la note s'ouvre.
  await call(SUB.yao, 'delete', `/authoring/campaigns/${now.id}`, 409);
  await call(SUB.mariam, 'post', `/authoring/campaigns/${now.id}/close`, 404);
  await call(SUB.yao, 'post', `/authoring/campaigns/${now.id}/close`, 204);
  const mineAfter = (await awaItems()).find((a) => a.id === mineBefore.id);
  assert.equal(mineAfter?.mine?.score, 75);
  await call(SUB.awa, 'post', `/assignments/${mineBefore.id}/answers`, 400, {
    attemptId: randomUUID(),
    answers: [{ choices: [0] }, { choices: [0] }, { choices: [0] }, { choices: [0] }],
  });
  assert.equal(
    (await call(SUB.yao, 'get', `/authoring/campaigns/${now.id}`, 200)).body.status,
    'close',
  );

  // Résultats sans nom d'élève : 6 copies (75 et 5 × 50) → moyenne 54, 6 sur 6 au seuil de 50 %.
  const results = (await call(SUB.yao, 'get', `/authoring/campaigns/${now.id}/results`, 200)).body;
  assert.equal(results.scope, 'campagne');
  assert.equal(results.participants, 6);
  assert.equal(results.average, 54);
  assert.equal(results.above, 100);
  assert.deepEqual(
    results.byDomain.map((d: { key: string }) => d.key),
    ['geometrie-espace'],
  );
  assert.equal(results.byQuestion.length, 4);
  assert.equal(results.groupLabel, 'DRENA');
  const school = results.schools.find((r: { participants: number }) => r.participants === 6);
  assert.equal(school.average, 54);
  assert.ok(!JSON.stringify(results).includes('Awa'));
  // La DRENA lit sa partie ; l'élève, rien.
  const regional = (await call(SUB.mariam, 'get', `/authoring/campaigns/${now.id}/results`, 200))
    .body;
  assert.equal(regional.scope, 'ma-zone');
  await call(SUB.awa, 'get', `/authoring/campaigns/${now.id}/results`, 404);
  assert.ok(
    (await call(SUB.mariam, 'get', '/authoring/campaigns/stats', 200)).body.items.some(
      (c: { id: string }) => c.id === now.id,
    ),
  );
});
