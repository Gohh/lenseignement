import type { AssignmentItem, AssignmentReview, MySubmission } from '@lenseignement/types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { assignments, assignmentSubmissions, cohortMembers, cohorts, users } from '../db/schema.js';
import { canManageCohort } from '../sessions/class-sessions.js';
import { audit, TeamError } from '../team/team.js';

const notFound = () => new TeamError('not_found', 'Devoir introuvable.');

async function isLearnerOf(db: Database, userId: string, cohortId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: cohortMembers.userId })
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        eq(cohortMembers.userId, userId),
        eq(cohortMembers.role, 'apprenant'),
      ),
    );
  return Boolean(row);
}

export async function createAssignment(
  db: Database,
  userId: string,
  cohortId: string,
  input: { title: string; instructions: string; dueAt?: string; maxScore: number },
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
    .insert(assignments)
    .values({
      cohortId,
      createdByUserId: userId,
      title: input.title,
      instructions: input.instructions,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      maxScore: input.maxScore,
    })
    .returning({ id: assignments.id });
  await audit(db, userId, 'assignment.create', cohortId, traceId);
  return { id: row!.id };
}

async function loadAssignment(db: Database, id: string) {
  const [row] = await db.select().from(assignments).where(eq(assignments.id, id));
  if (!row) throw notFound();
  return row;
}

async function managedAssignment(db: Database, userId: string, id: string) {
  const row = await loadAssignment(db, id);
  if (!(await canManageCohort(db, userId, row.cohortId))) throw notFound();
  return row;
}

const toSubmission = (s: {
  id: string;
  body: string;
  submittedAt: Date;
  score: number | null;
  comment: string | null;
  gradedAt: Date | null;
}): MySubmission & { id: string } => ({
  id: s.id,
  body: s.body,
  submittedAt: s.submittedAt.toISOString(),
  score: s.score,
  comment: s.comment,
  gradedAt: s.gradedAt?.toISOString() ?? null,
});

/** Devoirs des classes de la personne : ceux qu'elle doit rendre, ou ceux qu'elle corrige. */
export async function myAssignments(db: Database, userId: string): Promise<AssignmentItem[]> {
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
      id: assignments.id,
      cohortId: assignments.cohortId,
      cohortName: cohorts.name,
      title: assignments.title,
      instructions: assignments.instructions,
      dueAt: assignments.dueAt,
      maxScore: assignments.maxScore,
      createdAt: assignments.createdAt,
      teacherName: users.displayName,
      learnerCount: sql<number>`(select count(*)::int from cohort_members cm
        where cm.cohort_id = ${assignments.cohortId} and cm.role = 'apprenant')`,
      submittedCount: sql<number>`(select count(*)::int from assignment_submissions s
        where s.assignment_id = ${assignments.id})`,
      gradedCount: sql<number>`(select count(*)::int from assignment_submissions s
        where s.assignment_id = ${assignments.id} and s.score is not null)`,
    })
    .from(assignments)
    .innerJoin(cohorts, eq(cohorts.id, assignments.cohortId))
    .innerJoin(users, eq(users.id, assignments.createdByUserId))
    .where(inArray(assignments.cohortId, cohortIds))
    .orderBy(desc(assignments.createdAt))
    .limit(100);
  const submissions = rows.length
    ? await db
        .select()
        .from(assignmentSubmissions)
        .where(
          and(
            eq(assignmentSubmissions.learnerUserId, userId),
            inArray(
              assignmentSubmissions.assignmentId,
              rows.map((r) => r.id),
            ),
          ),
        )
    : [];
  const items: AssignmentItem[] = [];
  for (const r of rows) {
    const sub = submissions.find((s) => s.assignmentId === r.id);
    items.push({
      id: r.id,
      cohortId: r.cohortId,
      cohortName: r.cohortName,
      title: r.title,
      instructions: r.instructions,
      dueAt: r.dueAt?.toISOString() ?? null,
      maxScore: r.maxScore,
      createdAt: r.createdAt.toISOString(),
      teacherName: r.teacherName,
      canManage: await canManageCohort(db, userId, r.cohortId),
      mine: sub ? toSubmission(sub) : null,
      learnerCount: r.learnerCount,
      submittedCount: r.submittedCount,
      gradedCount: r.gradedCount,
    });
  }
  return items;
}

/** L'élève rend (ou remplace) sa copie, tant qu'elle n'est pas corrigée. */
export async function submitAssignment(
  db: Database,
  userId: string,
  assignmentId: string,
  body: string,
): Promise<void> {
  const assignment = await loadAssignment(db, assignmentId);
  if (!(await isLearnerOf(db, userId, assignment.cohortId))) throw notFound();
  const [existing] = await db
    .select({ id: assignmentSubmissions.id, score: assignmentSubmissions.score })
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.learnerUserId, userId),
      ),
    );
  if (existing?.score != null) {
    throw new TeamError('invalid', 'Ce devoir est déjà corrigé : il ne se modifie plus.');
  }
  if (existing) {
    await db
      .update(assignmentSubmissions)
      .set({ body, submittedAt: sql`now()` })
      .where(eq(assignmentSubmissions.id, existing.id));
  } else {
    await db.insert(assignmentSubmissions).values({ assignmentId, learnerUserId: userId, body });
  }
}

/** Pour l'enseignant : le devoir et chaque élève de la classe, avec sa copie s'il l'a rendue. */
export async function reviewAssignment(
  db: Database,
  userId: string,
  assignmentId: string,
): Promise<AssignmentReview> {
  const assignment = await managedAssignment(db, userId, assignmentId);
  const item = (await myAssignments(db, userId)).find((a) => a.id === assignment.id);
  if (!item) throw notFound();
  const learners = await db
    .select({ id: users.id, name: users.displayName })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(
      and(eq(cohortMembers.cohortId, assignment.cohortId), eq(cohortMembers.role, 'apprenant')),
    )
    .orderBy(asc(users.displayName));
  const subs = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.assignmentId, assignmentId));
  return {
    assignment: item,
    rows: learners.map((l) => {
      const s = subs.find((x) => x.learnerUserId === l.id);
      return {
        learnerId: l.id,
        learnerName: l.name ?? 'Élève',
        submission: s ? toSubmission(s) : null,
      };
    }),
  };
}

export async function gradeSubmission(
  db: Database,
  userId: string,
  submissionId: string,
  input: { score: number; comment?: string },
  traceId?: string,
): Promise<void> {
  const [submission] = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.id, submissionId));
  if (!submission) throw new TeamError('not_found', 'Copie introuvable.');
  const assignment = await managedAssignment(db, userId, submission.assignmentId).catch(() => {
    throw new TeamError('not_found', 'Copie introuvable.');
  });
  if (!Number.isInteger(input.score) || input.score > assignment.maxScore) {
    throw new TeamError('invalid', `La note est un nombre entier de 0 à ${assignment.maxScore}.`);
  }
  await db
    .update(assignmentSubmissions)
    .set({
      score: input.score,
      comment: input.comment || null,
      gradedByUserId: userId,
      gradedAt: sql`now()`,
    })
    .where(eq(assignmentSubmissions.id, submissionId));
  await audit(db, userId, 'assignment.grade', assignment.cohortId, traceId);
}

export async function deleteAssignment(
  db: Database,
  userId: string,
  assignmentId: string,
  traceId?: string,
): Promise<void> {
  const assignment = await managedAssignment(db, userId, assignmentId);
  await db.delete(assignments).where(eq(assignments.id, assignmentId));
  await audit(db, userId, 'assignment.delete', assignment.cohortId, traceId);
}
