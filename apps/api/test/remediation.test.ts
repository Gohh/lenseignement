import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DEMO_IDS as ID, DEMO_SUBJECTS as SUB } from '../src/db/demo-data.js';
import { diagnosticItems, remediationPlans } from '../src/db/schema.js';
import { DEMO_DIAGNOSTIC as CODE } from '../src/remediation/demo-diagnostic.js';
import { createTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;

before(async () => {
  ctx = await createTestApp();
});

after(async () => {
  await ctx.close();
});

// Apprenants inconnus du jeu de démonstration : chacun part de zéro.
const ALI = 'apprenant-bilan-ali';
const ESI = 'apprenant-bilan-esi';
const ZOE = 'apprenant-bilan-zoe';

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

interface Item {
  id: string;
  competencyCode: string;
  prompt: string;
  choices: string[];
}

/** Réponses : juste pour les compétences de `right`, fausse ailleurs (bonnes réponses en base). */
async function answersFor(items: Item[], right: string[]) {
  const rows = await ctx.db.select().from(diagnosticItems);
  const correctOf = new Map(rows.map((r) => [r.id, r.correctChoice]));
  return items.map((item) => {
    const correct = correctOf.get(item.id)!;
    const choice = right.includes(item.competencyCode) ? correct : (correct + 1) % 2;
    return { itemId: item.id, choice };
  });
}

async function diagnose(subject: string, right: string[], sessionId = randomUUID()) {
  const form = await call(subject, 'get', `/diagnostics/${CODE}`, 200);
  const answers = await answersFor(form.body.items, right);
  return call(subject, 'post', `/me/remediation/${CODE}/diagnostic`, 200, { sessionId, answers });
}

test('le bilan suit la version 2026 du programme, sans les bonnes réponses', async () => {
  await call(null, 'get', `/diagnostics/${CODE}`, 401);
  const form = await call(ALI, 'get', `/diagnostics/${CODE}`, 200);
  assert.equal(form.body.title, 'Bilan de lecture CP (démonstration)');
  assert.deepEqual(form.body.curriculum, { code: 'DEMO-PRIMAIRE', label: '2026' });
  assert.equal(form.body.items.length, 8);
  assert.deepEqual(
    [...new Set(form.body.items.map((i: Item) => i.competencyCode))],
    ['LECT-01', 'LECT-02', 'LECT-03', 'LECT-04'],
  );
  assert.ok(!JSON.stringify(form.body).includes('correct'));
  // Chaque question vise une compétence de la version 2026, pas de la 2025 (E2E-04).
  const { rows } = await ctx.db.execute<{ label: string }>(sql`
    select distinct v.label from diagnostic_items i
      join competencies c on c.id = i.competency_id
      join curriculum_versions v on v.id = c.version_id`);
  assert.deepEqual(rows, [{ label: '2026' }]);
  await call(ALI, 'get', '/diagnostics/INCONNU', 404);
});

test('orientation : premier prérequis à consolider, cours conseillé et explication', async () => {
  const res = await diagnose(ALI, ['LECT-01', 'LECT-04']);
  assert.deepEqual(
    res.body.latest.results.map((r: { code: string; mastered: boolean }) => [r.code, r.mastered]),
    [
      ['LECT-01', true],
      ['LECT-02', false],
      ['LECT-03', false],
      ['LECT-04', true],
    ],
  );
  const plan = res.body.plan;
  assert.equal(plan.status, 'active');
  assert.equal(plan.source, 'rule');
  assert.deepEqual(plan.competency, { code: 'LECT-02', title: 'Lire des syllabes simples' });
  assert.deepEqual(plan.course, {
    id: ID.courseLettres,
    title: 'Des lettres aux syllabes (démonstration)',
  });
  assert.deepEqual(plan.rationale, [
    '2 compétences sont à consolider : « Lire des syllabes simples », « Lire des mots courts ».',
    '« Lire des mots courts » demande d’abord « Lire des syllabes simples » : on commence donc par là.',
    "Ses prérequis sont acquis : « Reconnaître les lettres de l'alphabet ».",
    'Cours conseillé : « Des lettres aux syllabes (démonstration) », qui travaille cette compétence.',
    'Ensuite, un petit test de vérification montre si c’est acquis.',
  ]);
  assert.equal(res.body.postTest, null);
  assert.equal(res.body.canAdjust, false);
});

test('bilan renvoyé : enregistré une seule fois, et à son auteur seulement', async () => {
  const sessionId = randomUUID();
  const first = await diagnose(ESI, ['LECT-01', 'LECT-02', 'LECT-03'], sessionId);
  const again = await diagnose(ESI, ['LECT-01', 'LECT-02', 'LECT-03'], sessionId);
  assert.deepEqual(again.body, first.body);
  const { rows } = await ctx.db.execute<{ n: number }>(
    sql`select count(*)::int as n from diagnostic_sessions where id = ${sessionId}`,
  );
  assert.equal(rows[0]!.n, 1);
  // Rejouer l'identifiant d'une autre personne : refusé sans rien révéler.
  const form = await call(ZOE, 'get', `/diagnostics/${CODE}`, 200);
  const res = await call(ZOE, 'post', `/me/remediation/${CODE}/diagnostic`, 409, {
    sessionId,
    answers: await answersFor(form.body.items, []),
  });
  assert.equal(res.body.message, 'Bilan déjà enregistré.');
  // Réponses incomplètes refusées.
  await call(ZOE, 'post', `/me/remediation/${CODE}/diagnostic`, 400, {
    sessionId: randomUUID(),
    answers: (await answersFor(form.body.items, [])).slice(1),
  });
});

test('compétence sans prérequis à consolider et sans cours : l’enseignant prend le relais', async () => {
  // ESI : seule la compréhension (LECT-04) est à consolider.
  const res = await call(ESI, 'get', `/me/remediation/${CODE}`, 200);
  assert.equal(res.body.plan.competency.code, 'LECT-04');
  assert.equal(res.body.plan.course, null);
  assert.match(res.body.plan.rationale.join(' '), /Aucun cours publié ne travaille encore/);
});

test('petit test : à revoir, puis réussi, il termine le rattrapage', async () => {
  const form = await call(ALI, 'get', `/me/remediation/${CODE}/post-test`, 200);
  assert.deepEqual(
    form.body.items.map((i: Item) => [i.competencyCode, i.prompt]),
    [
      ['LECT-02', 'l et a se lisent :'],
      ['LECT-02', 't et o se lisent :'],
    ],
  );
  const missed = await call(ALI, 'post', `/me/remediation/${CODE}/post-test`, 200, {
    sessionId: randomUUID(),
    answers: await answersFor(form.body.items, []),
  });
  assert.equal(missed.body.plan.status, 'active');
  assert.deepEqual(
    { score: missed.body.postTest.score, mastered: missed.body.postTest.mastered },
    { score: 0, mastered: false },
  );

  const passed = await call(ALI, 'post', `/me/remediation/${CODE}/post-test`, 200, {
    sessionId: randomUUID(),
    answers: await answersFor(form.body.items, ['LECT-02']),
  });
  assert.equal(passed.body.plan.status, 'completed');
  assert.equal(passed.body.postTest.mastered, true);
  await call(ALI, 'get', `/me/remediation/${CODE}/post-test`, 404);

  // Nouveau bilan, tout acquis : plus d'orientation.
  const all = await diagnose(ALI, ['LECT-01', 'LECT-02', 'LECT-03', 'LECT-04']);
  assert.equal(all.body.plan, null);
  assert.ok(all.body.latest.results.every((r: { mastered: boolean }) => r.mastered));
});

test('fiche élève : l’enseignant voit et corrige l’orientation, le parent la voit seulement', async () => {
  await diagnose(SUB.awa, ['LECT-01']);
  const path = `/learners/${ID.userAwa}/remediation/${CODE}`;

  const teacher = await call(SUB.koffi, 'get', path, 200);
  assert.equal(teacher.body.canAdjust, true);
  assert.equal(teacher.body.plan.competency.code, 'LECT-02');
  const parent = await call(SUB.fatou, 'get', path, 200);
  assert.equal(parent.body.canAdjust, false);
  await call(SUB.aminata, 'get', path, 403);

  const body = { competencyCode: 'LECT-01', reason: 'Awa confond encore le b et le d en classe.' };
  await call(SUB.fatou, 'post', `${path}/override`, 403, body);
  await call(SUB.awa, 'post', `${path}/override`, 403, body);
  await call(SUB.aminata, 'post', `${path}/override`, 403, body);
  await call(SUB.koffi, 'post', `${path}/override`, 400, { ...body, reason: 'non' });
  await call(SUB.koffi, 'post', `${path}/override`, 400, { ...body, competencyCode: 'CALC-01' });

  const changed = await call(SUB.koffi, 'post', `${path}/override`, 200, body);
  assert.equal(changed.body.plan.source, 'teacher');
  assert.equal(changed.body.plan.competency.code, 'LECT-01');
  assert.equal(changed.body.plan.decidedBy, 'M. Koffi (fictif)');
  assert.equal(changed.body.plan.reason, body.reason);
  // L'ancienne orientation est gardée, marquée remplacée ; l'élève voit la nouvelle.
  const plans = await ctx.db
    .select({ status: remediationPlans.status, source: remediationPlans.source })
    .from(remediationPlans)
    .where(eq(remediationPlans.userId, ID.userAwa));
  assert.deepEqual(plans.map((p) => `${p.source}:${p.status}`).sort(), [
    'rule:replaced',
    'teacher:active',
  ]);
  const mine = await call(SUB.awa, 'get', `/me/remediation/${CODE}`, 200);
  assert.equal(mine.body.plan.competency.code, 'LECT-01');

  // Refus journalisés.
  const { rows } = await ctx.db.execute<{ n: number }>(sql`
    select count(*)::int as n from audit_logs
     where action = 'remediation.override' and decision = 'deny'
       and resource_id = ${ID.userAwa}`);
  assert.equal(rows[0]!.n, 3);
});

test('un élève sans bilan : rien à corriger', async () => {
  const path = `/learners/${ID.learnerKouame}/remediation/${CODE}`;
  const res = await call(SUB.koffi, 'get', path, 200);
  assert.equal(res.body.latest, null);
  const refused = await call(SUB.koffi, 'post', `${path}/override`, 409, {
    competencyCode: 'LECT-01',
    reason: 'Pour voir ce que ça donne.',
  });
  assert.equal(refused.body.message, 'L’élève n’a pas encore passé le bilan.');
});

test('questions, bilans et orientations ne se réécrivent pas', async () => {
  await assert.rejects(ctx.db.update(diagnosticItems).set({ correctChoice: 0 }));
  await assert.rejects(ctx.db.delete(diagnosticItems));
  await assert.rejects(ctx.db.execute(sql`update diagnostic_sessions set score = 0`));
  await assert.rejects(ctx.db.execute(sql`delete from skill_results`));
  // Un plan ne change pas son explication, ne se rouvre pas et ne se supprime pas.
  await assert.rejects(ctx.db.update(remediationPlans).set({ rationale: ['autre chose'] }));
  await assert.rejects(
    ctx.db
      .update(remediationPlans)
      .set({ status: 'active' })
      .where(eq(remediationPlans.status, 'replaced')),
  );
  await assert.rejects(ctx.db.delete(remediationPlans));
});
