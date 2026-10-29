import type { EvaluationItem, EvaluationSheet } from '@lenseignement/types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { cohortMembers, cohorts, evaluationScores, evaluations, users } from '../db/schema.js';
import { canManageCohort } from '../sessions/class-sessions.js';
import { TeamError, audit } from '../team/team.js';

const notFound = () => new TeamError('not_found', 'Évaluation introuvable.');

export async function createEvaluation(
  db: Database,
  userId: string,
  cohortId: string,
  input: { title: string; subject?: string; heldOn: string; maxScore: number; coefficient: number },
  traceId?: string,
): Promise<{ id: string }> {
  const [cohort] = await db
    .select({ id: cohorts.id, archivedAt: cohorts.archivedAt })
    .from(cohorts)
    .where(eq(cohorts.id, cohortId));
  if (!cohort || !(await canManageCohort(db, userId, cohortId))) {
    throw new TeamError('not_found', 'Classe introuvable.');
  }
  if (cohort.archivedAt) throw new TeamError('invalid', 'Cette classe est archivée.');
  const [row] = await db
    .insert(evaluations)
    .values({
      cohortId,
      createdByUserId: userId,
      title: input.title,
      subject: input.subject || null,
      heldOn: input.heldOn,
      maxScore: input.maxScore,
      coefficient: input.coefficient,
    })
    .returning({ id: evaluations.id });
  await audit(db, userId, 'evaluation.create', cohortId, traceId);
  return { id: row!.id };
}

async function managedEvaluation(db: Database, userId: string, evaluationId: string) {
  const [evaluation] = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId));
  if (!evaluation || !(await canManageCohort(db, userId, evaluation.cohortId))) throw notFound();
  return evaluation;
}

/** Évaluations des classes de la personne ; l'élève ne voit que sa propre note. */
export async function myEvaluations(db: Database, userId: string): Promise<EvaluationItem[]> {
  const mine = await db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(eq(cohortMembers.userId, userId));
  const managed = await db.execute(
    sql`select c.id from cohorts c where c.organization_id in ${teamOrganizationIds(userId)}`,
  );
  const cohortIds = [
    ...new Set([
      ...mine.map((m) => m.cohortId),
      ...managed.rows.map((r) => String((r as { id: string }).id)),
    ]),
  ];
  if (cohortIds.length === 0) return [];
  const rows = await db
    .select({
      id: evaluations.id,
      cohortId: evaluations.cohortId,
      cohortName: cohorts.name,
      title: evaluations.title,
      subject: evaluations.subject,
      heldOn: evaluations.heldOn,
      maxScore: evaluations.maxScore,
      coefficient: evaluations.coefficient,
      teacherName: users.displayName,
      learnerCount: sql<number>`(select count(*)::int from cohort_members cm
        where cm.cohort_id = ${evaluations.cohortId} and cm.role = 'apprenant')`,
      scoredCount: sql<number>`(select count(*)::int from evaluation_scores s
        where s.evaluation_id = ${evaluations.id})`,
      average: sql<number | null>`(select avg(s.score) from evaluation_scores s
        where s.evaluation_id = ${evaluations.id})`,
    })
    .from(evaluations)
    .innerJoin(cohorts, eq(cohorts.id, evaluations.cohortId))
    .innerJoin(users, eq(users.id, evaluations.createdByUserId))
    .where(inArray(evaluations.cohortId, cohortIds))
    .orderBy(desc(evaluations.heldOn), desc(evaluations.createdAt))
    .limit(200);
  const scores = rows.length
    ? await db
        .select()
        .from(evaluationScores)
        .where(
          and(
            eq(evaluationScores.learnerUserId, userId),
            inArray(
              evaluationScores.evaluationId,
              rows.map((r) => r.id),
            ),
          ),
        )
    : [];
  const items: EvaluationItem[] = [];
  for (const r of rows) {
    const score = scores.find((s) => s.evaluationId === r.id);
    items.push({
      id: r.id,
      cohortId: r.cohortId,
      cohortName: r.cohortName,
      title: r.title,
      subject: r.subject,
      heldOn: r.heldOn,
      maxScore: r.maxScore,
      coefficient: r.coefficient,
      teacherName: r.teacherName,
      canManage: await canManageCohort(db, userId, r.cohortId),
      myScore: score?.score ?? null,
      myComment: score?.comment ?? null,
      classAverage: r.average === null ? null : Math.round(Number(r.average) * 100) / 100,
      learnerCount: r.learnerCount,
      scoredCount: r.scoredCount,
    });
  }
  return items;
}

export async function evaluationSheet(
  db: Database,
  userId: string,
  evaluationId: string,
): Promise<EvaluationSheet> {
  const evaluation = await managedEvaluation(db, userId, evaluationId);
  const item = (await myEvaluations(db, userId)).find((e) => e.id === evaluation.id);
  if (!item) throw notFound();
  const learners = await db
    .select({ id: users.id, name: users.displayName })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(
      and(eq(cohortMembers.cohortId, evaluation.cohortId), eq(cohortMembers.role, 'apprenant')),
    )
    .orderBy(asc(users.displayName));
  const scores = await db
    .select()
    .from(evaluationScores)
    .where(eq(evaluationScores.evaluationId, evaluationId));
  return {
    evaluation: item,
    rows: learners.map((l) => {
      const s = scores.find((x) => x.learnerUserId === l.id);
      return {
        learnerId: l.id,
        learnerName: l.name ?? 'Élève',
        score: s?.score ?? null,
        comment: s?.comment ?? null,
      };
    }),
  };
}

/** Enregistre d'un coup les notes du carnet ; une note vide efface celle qui existait. */
export async function saveScores(
  db: Database,
  userId: string,
  evaluationId: string,
  input: { scores: { learnerId: string; score: number | null; comment?: string }[] },
  traceId?: string,
): Promise<void> {
  const evaluation = await managedEvaluation(db, userId, evaluationId);
  const members = await db
    .select({ id: cohortMembers.userId })
    .from(cohortMembers)
    .where(
      and(eq(cohortMembers.cohortId, evaluation.cohortId), eq(cohortMembers.role, 'apprenant')),
    );
  const allowed = new Set(members.map((m) => m.id));
  for (const entry of input.scores) {
    if (!allowed.has(entry.learnerId)) {
      throw new TeamError('invalid', 'Cet élève n’est pas dans la classe.');
    }
    if (
      entry.score !== null &&
      (entry.score > evaluation.maxScore || !Number.isInteger(entry.score * 4))
    ) {
      throw new TeamError(
        'invalid',
        `Une note va de 0 à ${evaluation.maxScore}, par quarts de point au plus.`,
      );
    }
  }
  for (const entry of input.scores) {
    if (entry.score === null) {
      await db
        .delete(evaluationScores)
        .where(
          and(
            eq(evaluationScores.evaluationId, evaluationId),
            eq(evaluationScores.learnerUserId, entry.learnerId),
          ),
        );
      continue;
    }
    await db
      .insert(evaluationScores)
      .values({
        evaluationId,
        learnerUserId: entry.learnerId,
        score: entry.score,
        comment: entry.comment || null,
      })
      .onConflictDoUpdate({
        target: [evaluationScores.evaluationId, evaluationScores.learnerUserId],
        set: { score: entry.score, comment: entry.comment || null, updatedAt: sql`now()` },
      });
  }
  await audit(db, userId, 'evaluation.scores', evaluation.cohortId, traceId);
}

export async function deleteEvaluation(
  db: Database,
  userId: string,
  evaluationId: string,
  traceId?: string,
): Promise<void> {
  const evaluation = await managedEvaluation(db, userId, evaluationId);
  await db.delete(evaluations).where(eq(evaluations.id, evaluationId));
  await audit(db, userId, 'evaluation.delete', evaluation.cohortId, traceId);
}
