import {
  ASSIGNMENT_MAX_EXERCISES,
  EXERCISE_DOMAINS,
  exercisePlay,
  gradeExercise,
  type AssignmentAnswers,
  type AssignmentExerciseResult,
  type AssignmentExerciseSummary,
  type AssignmentWork,
  type ExerciseDomain,
  type MySubmission,
} from '@lenseignement/types';
import { and, asc, desc, eq, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  assignmentExercises,
  assignmentSubmissions,
  competencies,
  exercises,
} from '../db/schema.js';
import { canManageCohort } from '../sessions/class-sessions.js';
import { audit, TeamError } from '../team/team.js';
import {
  isLearnerOf,
  loadAssignment,
  managedAssignment,
  maskSubmission,
  myAssignments,
  notFound,
  resultsHidden,
  toSubmission,
} from './assignments.js';

/**
 * Devoirs faits d'exercices de la Fabrique (étape 2b). L'enseignant choisit des exercices publiés
 * de la banque ; l'élève les fait (en ligne ou sans connexion) et la plateforme les corrige :
 * la note du devoir est la part des points obtenus, ramenée à la note maximale.
 */

/** Exercices d'un devoir, dans l'ordre. */
export async function assignmentExerciseList(
  db: Database,
  assignmentId: string,
): Promise<AssignmentExerciseSummary[]> {
  return db
    .select({
      id: exercises.id,
      title: exercises.title,
      kind: exercises.kind,
      domain: exercises.domain,
      competency: sql<string>`${competencies.code} || ' ' || ${competencies.title}`,
    })
    .from(assignmentExercises)
    .innerJoin(exercises, eq(exercises.id, assignmentExercises.exerciseId))
    .innerJoin(competencies, eq(competencies.id, exercises.competencyId))
    .where(eq(assignmentExercises.assignmentId, assignmentId))
    .orderBy(asc(assignmentExercises.position)) as Promise<AssignmentExerciseSummary[]>;
}

async function hasSubmissions(db: Database, assignmentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: assignmentSubmissions.id })
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.assignmentId, assignmentId))
    .limit(1);
  return Boolean(row);
}

async function editable(db: Database, userId: string, assignmentId: string) {
  const assignment = await managedAssignment(db, userId, assignmentId);
  if (assignment.examId) {
    throw new TeamError('invalid', 'Les questions d’une épreuve ne changent pas depuis le devoir.');
  }
  if (await hasSubmissions(db, assignmentId)) {
    throw new TeamError(
      'invalid',
      'Un élève a déjà rendu ce devoir : ses exercices ne changent plus.',
    );
  }
  return assignment;
}

/** Exercices publiés de la banque qu'on peut encore ajouter au devoir. */
export async function exerciseCandidates(
  db: Database,
  userId: string,
  assignmentId: string,
  filters: { q?: string; domain?: string },
): Promise<AssignmentExerciseSummary[]> {
  await managedAssignment(db, userId, assignmentId);
  const already = db
    .select({ id: assignmentExercises.exerciseId })
    .from(assignmentExercises)
    .where(eq(assignmentExercises.assignmentId, assignmentId));
  const conditions: SQL[] = [eq(exercises.status, 'published'), notInArray(exercises.id, already)];
  if (filters.domain && (EXERCISE_DOMAINS as readonly string[]).includes(filters.domain)) {
    conditions.push(eq(exercises.domain, filters.domain as ExerciseDomain));
  }
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(
      sql`(${exercises.title} ilike ${like} or ${competencies.title} ilike ${like} or ${competencies.code} ilike ${like})`,
    );
  }
  return db
    .select({
      id: exercises.id,
      title: exercises.title,
      kind: exercises.kind,
      domain: exercises.domain,
      competency: sql<string>`${competencies.code} || ' ' || ${competencies.title}`,
    })
    .from(exercises)
    .innerJoin(competencies, eq(competencies.id, exercises.competencyId))
    .where(and(...conditions))
    .orderBy(desc(exercises.publishedAt))
    .limit(30) as Promise<AssignmentExerciseSummary[]>;
}

export async function addAssignmentExercise(
  db: Database,
  userId: string,
  assignmentId: string,
  exerciseId: string,
  traceId?: string,
): Promise<void> {
  const assignment = await editable(db, userId, assignmentId);
  const [exercise] = await db
    .select({ status: exercises.status })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  if (!exercise || exercise.status !== 'published') {
    throw new TeamError('invalid', 'Choisissez un exercice publié de la banque.');
  }
  const current = await assignmentExerciseList(db, assignmentId);
  if (current.some((e) => e.id === exerciseId)) return;
  if (current.length >= ASSIGNMENT_MAX_EXERCISES) {
    throw new TeamError('invalid', `${ASSIGNMENT_MAX_EXERCISES} exercices au plus par devoir.`);
  }
  await db
    .insert(assignmentExercises)
    .values({ assignmentId, exerciseId, position: current.length })
    .onConflictDoNothing();
  await audit(db, userId, 'assignment.exercise.add', assignment.cohortId, traceId);
}

export async function removeAssignmentExercise(
  db: Database,
  userId: string,
  assignmentId: string,
  exerciseId: string,
  traceId?: string,
): Promise<void> {
  const assignment = await editable(db, userId, assignmentId);
  await db
    .delete(assignmentExercises)
    .where(
      and(
        eq(assignmentExercises.assignmentId, assignmentId),
        eq(assignmentExercises.exerciseId, exerciseId),
      ),
    );
  await audit(db, userId, 'assignment.exercise.remove', assignment.cohortId, traceId);
}

async function contents(db: Database, assignmentId: string) {
  return db
    .select({ id: exercises.id, title: exercises.title, content: exercises.content })
    .from(assignmentExercises)
    .innerJoin(exercises, eq(exercises.id, assignmentExercises.exerciseId))
    .where(eq(assignmentExercises.assignmentId, assignmentId))
    .orderBy(asc(assignmentExercises.position));
}

/** Pour l'élève (ou l'enseignant, en aperçu) : les exercices sans leur corrigé. */
export async function assignmentWork(
  db: Database,
  userId: string,
  assignmentId: string,
): Promise<AssignmentWork> {
  const assignment = await loadAssignment(db, assignmentId);
  const allowed =
    (await isLearnerOf(db, userId, assignment.cohortId)) ||
    (await canManageCohort(db, userId, assignment.cohortId));
  if (!allowed) throw notFound();
  if (
    (assignment.onPaper || (assignment.opensAt && assignment.opensAt.getTime() > Date.now())) &&
    !(await canManageCohort(db, userId, assignment.cohortId))
  ) {
    throw notFound();
  }
  const item = (await myAssignments(db, userId)).find((a) => a.id === assignmentId);
  if (!item) throw notFound();
  const rows = await contents(db, assignmentId);
  return {
    assignment: item,
    exercises: rows.map((r) => ({ id: r.id, title: r.title, play: exercisePlay(r.content) })),
  };
}

/**
 * L'élève rend ses réponses : la plateforme corrige chaque exercice et note le devoir. Un renvoi
 * du même envoi (hors ligne, double clic) rend la même copie sans la compter deux fois.
 */
export async function answerAssignment(
  db: Database,
  userId: string,
  assignmentId: string,
  input: AssignmentAnswers,
): Promise<MySubmission> {
  const assignment = await loadAssignment(db, assignmentId);
  if (!(await isLearnerOf(db, userId, assignment.cohortId))) throw notFound();
  if (assignment.onPaper) {
    throw new TeamError(
      'invalid',
      'Cette épreuve se passe sur papier : ton enseignant saisit ta copie.',
    );
  }
  if (assignment.opensAt && assignment.opensAt.getTime() > Date.now()) {
    throw new TeamError('invalid', 'Cette évaluation n’a pas encore commencé.');
  }
  const hidden = resultsHidden(assignment);
  if (assignment.campaignId && !hidden) {
    throw new TeamError('invalid', 'Cette évaluation est terminée.');
  }
  const [existing] = await db
    .select()
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        eq(assignmentSubmissions.learnerUserId, userId),
      ),
    );
  if (existing) {
    if (existing.attemptId === input.attemptId)
      return maskSubmission(toSubmission(existing), hidden);
    throw new TeamError('invalid', 'Tu as déjà rendu ce devoir.');
  }
  const rows = await contents(db, assignmentId);
  if (rows.length === 0) throw new TeamError('invalid', 'Ce devoir n’a pas d’exercice.');
  if (input.answers.length !== rows.length) {
    throw new TeamError('invalid', 'Réponds à tous les exercices du devoir.');
  }
  const results: AssignmentExerciseResult[] = rows.map((row, i) => ({
    exerciseId: row.id,
    title: row.title,
    ...gradeExercise(row.content, input.answers[i]!),
  }));
  const ratio = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const correct = results.filter((r) => r.correct).length;
  const [saved] = await db
    .insert(assignmentSubmissions)
    .values({
      assignmentId,
      learnerUserId: userId,
      body: `Exercices réussis : ${correct} sur ${results.length}.`,
      results,
      attemptId: input.attemptId,
      score: Math.round(ratio * assignment.maxScore),
      gradedAt: sql`now()`,
    })
    .onConflictDoNothing()
    .returning();
  if (!saved) {
    // Deux envois en même temps : la première copie reste.
    const [first] = await db
      .select()
      .from(assignmentSubmissions)
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.learnerUserId, userId),
        ),
      );
    if (first?.attemptId === input.attemptId) return maskSubmission(toSubmission(first), hidden);
    throw new TeamError('invalid', 'Tu as déjà rendu ce devoir.');
  }
  return maskSubmission(toSubmission(saved), hidden);
}
