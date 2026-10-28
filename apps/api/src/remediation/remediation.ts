import type {
  DiagnosticForm,
  DiagnosticSubmission,
  PostTestResult,
  RemediationOverride,
  RemediationOverview,
  RemediationPlan,
  SkillResult,
} from '@lenseignement/types';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Database, Executor } from '../db/database.js';
import {
  competencies,
  competencyEdges,
  courses,
  courseVersionCompetencies,
  courseVersions,
  curricula,
  curriculumVersions,
  diagnosticItems,
  diagnosticResponses,
  diagnostics,
  diagnosticSessions,
  remediationPlans,
  skillResults,
  users,
} from '../db/schema.js';
import { LearningError } from '../learning/learning.js';

/**
 * Bilan et rattrapage (ADR-013). Règle V1, déterministe et explicable :
 * bilan → compétences à consolider → premier prérequis à consolider → cours conseillé →
 * petit test de vérification. Une compétence est acquise quand toutes ses réponses sont justes.
 */

type Item = typeof diagnosticItems.$inferSelect;
type Competency = { id: string; code: string; title: string; position: number };
type Phase = 'diagnostic' | 'post_test';

/** Bilan, compétences visées (de la version exacte du programme) et prérequis entre elles. */
async function loadDiagnostic(db: Executor, code: string) {
  const [diagnostic] = await db
    .select({
      id: diagnostics.id,
      code: diagnostics.code,
      title: diagnostics.title,
      versionId: diagnostics.curriculumVersionId,
      curriculumCode: curricula.code,
      label: curriculumVersions.label,
    })
    .from(diagnostics)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, diagnostics.curriculumVersionId))
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .where(eq(diagnostics.code, code));
  if (!diagnostic) throw new LearningError('not_found', 'Bilan introuvable.');
  const items = await db
    .select()
    .from(diagnosticItems)
    .where(eq(diagnosticItems.diagnosticId, diagnostic.id))
    .orderBy(asc(diagnosticItems.phase), asc(diagnosticItems.position));
  const ids = [...new Set(items.map((i) => i.competencyId))];
  const comps: Competency[] =
    ids.length === 0
      ? []
      : await db
          .select({
            id: competencies.id,
            code: competencies.code,
            title: competencies.title,
            position: competencies.position,
          })
          .from(competencies)
          .where(inArray(competencies.id, ids));
  const edges = await db
    .select({ from: competencyEdges.prerequisiteId, to: competencyEdges.competencyId })
    .from(competencyEdges)
    .where(eq(competencyEdges.versionId, diagnostic.versionId));
  return { diagnostic, items, comps: topoOrder(comps, edges), edges };
}

/** Ordre du programme où chaque prérequis passe avant ce qui en dépend (à égalité : position). */
function topoOrder(comps: Competency[], edges: Array<{ from: string; to: string }>) {
  const inSet = new Set(comps.map((c) => c.id));
  const pending = new Map(comps.map((c) => [c.id, 0]));
  for (const e of edges) {
    if (inSet.has(e.from) && inSet.has(e.to)) pending.set(e.to, (pending.get(e.to) ?? 0) + 1);
  }
  const ordered: Competency[] = [];
  const left = [...comps].sort((a, b) => a.position - b.position);
  while (left.length > 0) {
    const index = left.findIndex((c) => pending.get(c.id) === 0);
    const [next] = left.splice(index === -1 ? 0 : index, 1);
    ordered.push(next!);
    for (const e of edges) {
      if (e.from === next!.id && pending.has(e.to)) pending.set(e.to, pending.get(e.to)! - 1);
    }
  }
  return ordered;
}

/** Tous les prérequis, directs ou non, d'une compétence. */
function ancestors(id: string, edges: Array<{ from: string; to: string }>): Set<string> {
  const found = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const e of edges) {
      if (e.to === current && !found.has(e.from)) {
        found.add(e.from);
        stack.push(e.from);
      }
    }
  }
  return found;
}

/** Correction : une réponse, et une seule, pour chaque question de la série. */
function grade(items: Item[], answers: DiagnosticSubmission['answers']) {
  const byItem = new Map(answers.map((a) => [a.itemId, a.choice]));
  if (byItem.size !== answers.length || byItem.size !== items.length) {
    throw new LearningError('invalid', 'Répondez à chaque question, une seule fois.');
  }
  return items.map((item) => {
    const choice = byItem.get(item.id);
    if (choice === undefined || choice >= item.choices.length) {
      throw new LearningError('invalid', 'Répondez à chaque question, une seule fois.');
    }
    return { item, choice, correct: choice === item.correctChoice };
  });
}

function resultsOf(comps: Competency[], graded: ReturnType<typeof grade>): SkillResult[] {
  return comps.flatMap((c) => {
    const mine = graded.filter((g) => g.item.competencyId === c.id);
    if (mine.length === 0) return [];
    const correct = mine.filter((g) => g.correct).length;
    return [
      {
        code: c.code,
        title: c.title,
        correct,
        total: mine.length,
        mastered: correct === mine.length,
      },
    ];
  });
}

/** Premier cours publié qui travaille cette compétence (même version du programme). */
async function recommendedCourse(db: Executor, competencyId: string) {
  const [row] = await db
    .select({ id: courses.id, title: courseVersions.title })
    .from(courseVersionCompetencies)
    .innerJoin(courseVersions, eq(courseVersions.id, courseVersionCompetencies.courseVersionId))
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .where(
      and(
        eq(courseVersionCompetencies.competencyId, competencyId),
        eq(courseVersions.status, 'published'),
      ),
    )
    .orderBy(asc(courseVersions.title))
    .limit(1);
  return row ?? null;
}

function courseLine(course: { title: string } | null): string {
  return course
    ? `Cours conseillé : « ${course.title} », qui travaille cette compétence.`
    : 'Aucun cours publié ne travaille encore cette compétence : l’enseignant peut proposer une activité en classe.';
}

const NEXT_STEP = 'Ensuite, un petit test de vérification montre si c’est acquis.';

/** La règle : compétence à travailler en premier, et son explication en phrases simples. */
export function propose(
  comps: Competency[],
  edges: Array<{ from: string; to: string }>,
  results: SkillResult[],
): { competency: Competency; rationale: string[] } | null {
  const gaps = comps.filter((c) => results.some((r) => r.code === c.code && !r.mastered));
  const target = gaps[0];
  if (!target) return null;
  const rationale = [
    gaps.length === 1
      ? `Une compétence est à consolider : « ${target.title} ».`
      : `${gaps.length} compétences sont à consolider : ${gaps.map((g) => `« ${g.title} »`).join(', ')}.`,
  ];
  // Ordre des prérequis : aucune compétence à consolider ne passe avant la cible.
  const dependent = gaps.find((g) => g.id !== target.id && ancestors(g.id, edges).has(target.id));
  rationale.push(
    dependent
      ? `« ${dependent.title} » demande d’abord « ${target.title} » : on commence donc par là.`
      : `« ${target.title} » vient en premier dans l’ordre du programme : on commence par là.`,
  );
  const prerequisites = comps.filter((c) => ancestors(target.id, edges).has(c.id));
  if (prerequisites.length > 0) {
    rationale.push(
      `Ses prérequis sont acquis : ${prerequisites.map((p) => `« ${p.title} »`).join(', ')}.`,
    );
  }
  return { competency: target, rationale };
}

export async function diagnosticForm(db: Executor, code: string): Promise<DiagnosticForm> {
  const { diagnostic, items, comps } = await loadDiagnostic(db, code);
  const codeOf = new Map(comps.map((c) => [c.id, c.code]));
  return {
    code: diagnostic.code,
    title: diagnostic.title,
    curriculum: { code: diagnostic.curriculumCode, label: diagnostic.label },
    items: items
      .filter((i) => i.phase === 'diagnostic')
      .map((i) => ({
        id: i.id,
        competencyCode: codeOf.get(i.competencyId) ?? '',
        prompt: i.prompt,
        choices: i.choices,
      })),
  };
}

/** Enregistre une série corrigée ; renvoie faux si cette série avait déjà été reçue. */
async function storeSession(
  tx: Executor,
  userId: string,
  diagnosticId: string,
  phase: Phase,
  planId: string | null,
  sessionId: string,
  graded: ReturnType<typeof grade>,
  results: SkillResult[],
  comps: Competency[],
): Promise<boolean> {
  const [created] = await tx
    .insert(diagnosticSessions)
    .values({
      id: sessionId,
      userId,
      diagnosticId,
      phase,
      planId,
      score: graded.filter((g) => g.correct).length,
      total: graded.length,
    })
    .onConflictDoNothing()
    .returning({ id: diagnosticSessions.id });
  if (!created) return false;
  await tx.insert(diagnosticResponses).values(
    graded.map((g) => ({
      sessionId,
      itemId: g.item.id,
      choice: g.choice,
      correct: g.correct,
    })),
  );
  const idOf = new Map(comps.map((c) => [c.code, c.id]));
  await tx.insert(skillResults).values(
    results.map((r) => ({
      sessionId,
      competencyId: idOf.get(r.code)!,
      correct: r.correct,
      total: r.total,
      mastered: r.mastered,
    })),
  );
  return true;
}

/** Renvoi d'une série déjà reçue : permis à son auteur seulement. */
async function assertOwnSession(db: Executor, sessionId: string, userId: string) {
  const [existing] = await db
    .select({ userId: diagnosticSessions.userId })
    .from(diagnosticSessions)
    .where(eq(diagnosticSessions.id, sessionId));
  if (existing?.userId !== userId) {
    throw new LearningError('conflict', 'Bilan déjà enregistré.');
  }
}

/** Une décision à la fois par apprenant : deux envois simultanés ne créent pas deux plans. */
async function lockLearner(tx: Executor, userId: string) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
}

async function closeActivePlan(tx: Executor, userId: string, status: 'completed' | 'replaced') {
  await tx
    .update(remediationPlans)
    .set({ status, closedAt: new Date() })
    .where(and(eq(remediationPlans.userId, userId), eq(remediationPlans.status, 'active')));
}

/**
 * Bilan d'un apprenant : corrigé, enregistré, puis orienté. Un nouveau bilan remplace
 * l'orientation en cours (ou la clôt si tout est acquis). Idempotent par `sessionId`.
 */
export async function submitDiagnostic(
  db: Database,
  userId: string,
  code: string,
  input: DiagnosticSubmission,
): Promise<RemediationOverview> {
  const { diagnostic, items, comps, edges } = await loadDiagnostic(db, code);
  const graded = grade(
    items.filter((i) => i.phase === 'diagnostic'),
    input.answers,
  );
  const results = resultsOf(comps, graded);
  const proposal = propose(comps, edges, results);
  const course = proposal ? await recommendedCourse(db, proposal.competency.id) : null;

  const stored = await db.transaction(async (tx) => {
    await lockLearner(tx, userId);
    const created = await storeSession(
      tx,
      userId,
      diagnostic.id,
      'diagnostic',
      null,
      input.sessionId,
      graded,
      results,
      comps,
    );
    if (!created) return false;
    await closeActivePlan(tx, userId, proposal ? 'replaced' : 'completed');
    if (proposal) {
      await tx.insert(remediationPlans).values({
        userId,
        diagnosticId: diagnostic.id,
        diagnosticSessionId: input.sessionId,
        competencyId: proposal.competency.id,
        courseId: course?.id ?? null,
        rationale: [...proposal.rationale, courseLine(course), NEXT_STEP],
        source: 'rule',
      });
    }
    return true;
  });
  if (!stored) await assertOwnSession(db, input.sessionId, userId);
  return overview(db, userId, code, false);
}

/** Questions du petit test de vérification de l'orientation en cours. */
export async function postTestForm(
  db: Executor,
  userId: string,
  code: string,
): Promise<DiagnosticForm> {
  const { diagnostic, items, comps } = await loadDiagnostic(db, code);
  const plan = await activePlan(db, userId, diagnostic.id);
  if (!plan) throw new LearningError('not_found', 'Aucun rattrapage en cours.');
  const mine = items.filter((i) => i.phase === 'post_test' && i.competencyId === plan.competencyId);
  if (mine.length === 0) {
    throw new LearningError('not_found', 'Pas encore de petit test pour cette compétence.');
  }
  const codeOf = new Map(comps.map((c) => [c.id, c.code]));
  return {
    code: diagnostic.code,
    title: diagnostic.title,
    curriculum: { code: diagnostic.curriculumCode, label: diagnostic.label },
    items: mine.map((i) => ({
      id: i.id,
      competencyCode: codeOf.get(i.competencyId) ?? '',
      prompt: i.prompt,
      choices: i.choices,
    })),
  };
}

async function activePlan(db: Executor, userId: string, diagnosticId: string) {
  const [plan] = await db
    .select()
    .from(remediationPlans)
    .where(
      and(
        eq(remediationPlans.userId, userId),
        eq(remediationPlans.diagnosticId, diagnosticId),
        eq(remediationPlans.status, 'active'),
      ),
    );
  return plan;
}

/** Petit test : réussi (tout juste), il termine l'orientation ; sinon on revoit et on réessaie. */
export async function submitPostTest(
  db: Database,
  userId: string,
  code: string,
  input: DiagnosticSubmission,
): Promise<RemediationOverview> {
  const { diagnostic, items, comps } = await loadDiagnostic(db, code);
  const plan = await activePlan(db, userId, diagnostic.id);
  if (!plan) {
    // Renvoi d'un petit test qui a terminé l'orientation : on rend le résultat enregistré.
    await assertOwnSession(db, input.sessionId, userId);
    return overview(db, userId, code, false);
  }
  const graded = grade(
    items.filter((i) => i.phase === 'post_test' && i.competencyId === plan.competencyId),
    input.answers,
  );
  const results = resultsOf(comps, graded);
  const stored = await db.transaction(async (tx) => {
    await lockLearner(tx, userId);
    // L'orientation a pu changer entre-temps (correction de l'enseignant, nouveau bilan).
    if ((await activePlan(tx, userId, diagnostic.id))?.id !== plan.id) {
      throw new LearningError('conflict', 'Ton rattrapage a changé : recharge la page.');
    }
    const created = await storeSession(
      tx,
      userId,
      diagnostic.id,
      'post_test',
      plan.id,
      input.sessionId,
      graded,
      results,
      comps,
    );
    if (created && results.every((r) => r.mastered)) {
      await closeActivePlan(tx, userId, 'completed');
    }
    return created;
  });
  if (!stored) await assertOwnSession(db, input.sessionId, userId);
  return overview(db, userId, code, false);
}

/**
 * Correction de l'orientation par un enseignant du périmètre (le contrôle d'accès est fait par
 * l'appelant). L'orientation précédente est gardée, marquée « remplacée ».
 */
export async function overridePlan(
  db: Database,
  actorId: string,
  learnerId: string,
  code: string,
  input: RemediationOverride,
): Promise<RemediationOverview> {
  const { diagnostic, comps } = await loadDiagnostic(db, code);
  const competency = comps.find((c) => c.code === input.competencyCode);
  if (!competency) throw new LearningError('invalid', 'Compétence inconnue pour ce bilan.');
  const [latest] = await db
    .select({ id: diagnosticSessions.id })
    .from(diagnosticSessions)
    .where(
      and(
        eq(diagnosticSessions.userId, learnerId),
        eq(diagnosticSessions.diagnosticId, diagnostic.id),
        eq(diagnosticSessions.phase, 'diagnostic'),
      ),
    )
    .orderBy(desc(diagnosticSessions.submittedAt))
    .limit(1);
  if (!latest) throw new LearningError('conflict', 'L’élève n’a pas encore passé le bilan.');
  const course = await recommendedCourse(db, competency.id);
  await db.transaction(async (tx) => {
    await lockLearner(tx, learnerId);
    await closeActivePlan(tx, learnerId, 'replaced');
    await tx.insert(remediationPlans).values({
      userId: learnerId,
      diagnosticId: diagnostic.id,
      diagnosticSessionId: latest.id,
      competencyId: competency.id,
      courseId: course?.id ?? null,
      rationale: [
        `Orientation choisie par l’enseignant : « ${competency.title} ».`,
        courseLine(course),
        NEXT_STEP,
      ],
      source: 'teacher',
      decidedBy: actorId,
      reason: input.reason,
    });
  });
  return overview(db, learnerId, code, true);
}

/** Dernier bilan, orientation en cours (ou dernière terminée) et dernier petit test. */
export async function overview(
  db: Executor,
  userId: string,
  code: string,
  canAdjust: boolean,
): Promise<RemediationOverview> {
  const { diagnostic, comps } = await loadDiagnostic(db, code);
  const head = {
    code: diagnostic.code,
    title: diagnostic.title,
    curriculum: { code: diagnostic.curriculumCode, label: diagnostic.label },
  };
  const [session] = await db
    .select()
    .from(diagnosticSessions)
    .where(
      and(
        eq(diagnosticSessions.userId, userId),
        eq(diagnosticSessions.diagnosticId, diagnostic.id),
        eq(diagnosticSessions.phase, 'diagnostic'),
      ),
    )
    .orderBy(desc(diagnosticSessions.submittedAt))
    .limit(1);
  if (!session) return { diagnostic: head, latest: null, plan: null, postTest: null, canAdjust };

  const rows = await db
    .select({ result: skillResults, code: competencies.code, title: competencies.title })
    .from(skillResults)
    .innerJoin(competencies, eq(competencies.id, skillResults.competencyId))
    .where(eq(skillResults.sessionId, session.id));
  const order = new Map(comps.map((c, i) => [c.id, i]));
  const results = rows
    .sort(
      (a, b) => (order.get(a.result.competencyId) ?? 0) - (order.get(b.result.competencyId) ?? 0),
    )
    .map((r) => ({
      code: r.code,
      title: r.title,
      correct: r.result.correct,
      total: r.result.total,
      mastered: r.result.mastered,
    }));

  // L'orientation en cours, sinon la dernière (terminée ou remplacée par un bilan tout acquis).
  const [planRow] = await db
    .select({
      plan: remediationPlans,
      code: competencies.code,
      title: competencies.title,
      courseTitle: courseVersions.title,
      decidedByName: users.displayName,
    })
    .from(remediationPlans)
    .innerJoin(competencies, eq(competencies.id, remediationPlans.competencyId))
    .leftJoin(
      courseVersions,
      and(
        eq(courseVersions.courseId, remediationPlans.courseId),
        eq(courseVersions.status, 'published'),
      ),
    )
    .leftJoin(users, eq(users.id, remediationPlans.decidedBy))
    .where(
      and(eq(remediationPlans.userId, userId), eq(remediationPlans.diagnosticId, diagnostic.id)),
    )
    .orderBy(asc(remediationPlans.status), desc(remediationPlans.createdAt))
    .limit(1);
  // Un bilan plus récent que le dernier plan et sans orientation : tout est acquis.
  const planIsCurrent = planRow && planRow.plan.createdAt >= session.submittedAt;
  const plan: RemediationPlan | null =
    planRow && (planRow.plan.status === 'active' || planIsCurrent)
      ? {
          id: planRow.plan.id,
          status: planRow.plan.status,
          source: planRow.plan.source,
          competency: { code: planRow.code, title: planRow.title },
          course:
            planRow.plan.courseId && planRow.courseTitle
              ? { id: planRow.plan.courseId, title: planRow.courseTitle }
              : null,
          rationale: planRow.plan.rationale,
          decidedBy: planRow.plan.source === 'teacher' ? planRow.decidedByName : null,
          reason: planRow.plan.reason,
          createdAt: planRow.plan.createdAt.toISOString(),
        }
      : null;

  let postTest: PostTestResult | null = null;
  if (plan) {
    const [last] = await db
      .select()
      .from(diagnosticSessions)
      .where(eq(diagnosticSessions.planId, plan.id))
      .orderBy(desc(diagnosticSessions.submittedAt))
      .limit(1);
    if (last) {
      postTest = {
        score: last.score,
        total: last.total,
        mastered: last.score === last.total,
        submittedAt: last.submittedAt.toISOString(),
      };
    }
  }
  return {
    diagnostic: head,
    latest: { submittedAt: session.submittedAt.toISOString(), results },
    plan,
    postTest,
    canAdjust,
  };
}
