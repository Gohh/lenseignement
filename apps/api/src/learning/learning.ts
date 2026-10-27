import type { CourseProgress, LearningPlanItem } from '@lenseignement/types';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../db/database.js';
import { courses, courseVersions, enrollments, lessonProgress, lessons } from '../db/schema.js';
import { emit } from '../events/outbox.js';

/** Erreur métier de l'apprentissage, traduite en 404 ou 409 par le contrôleur. */
export class LearningError extends Error {
  constructor(
    readonly kind: 'not_found' | 'conflict' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/** Version publiée d'un cours et son nombre de leçons ; seule une version publiée se suit. */
export async function publishedVersion(db: Executor, courseId: string) {
  const [row] = await db
    .select({
      id: courseVersions.id,
      title: courseVersions.title,
      branch: courses.branch,
      total: sql<number>`(select count(*)::int from ${lessons} l where l.course_version_id = ${courseVersions.id})`,
    })
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .where(and(eq(courseVersions.courseId, courseId), eq(courseVersions.status, 'published')));
  if (!row) throw new LearningError('not_found', 'Cours introuvable.');
  return row;
}

export async function findEnrollment(db: Executor, userId: string, courseId: string) {
  const [row] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)));
  return row;
}

function summarize(
  courseId: string,
  total: number,
  enrollment: { lastLessonNumber: number | null } | undefined,
  done: number[],
): CourseProgress {
  // Une nouvelle version peut avoir moins de leçons : on ne compte que celles qui existent.
  const completed = [...new Set(done)].filter((n) => n <= total).sort((a, b) => a - b);
  const last = enrollment?.lastLessonNumber ?? null;
  const firstOpen = Array.from({ length: total }, (_, i) => i + 1).find(
    (n) => !completed.includes(n),
  );
  const resumeAt =
    !enrollment || firstOpen === undefined
      ? null
      : last !== null && last <= total && !completed.includes(last)
        ? last
        : firstOpen;
  return {
    courseId,
    enrolled: Boolean(enrollment),
    total,
    completed,
    resumeAt,
    finished: Boolean(enrollment) && total > 0 && completed.length === total,
  };
}

async function completedNumbers(db: Executor, enrollmentId: string): Promise<number[]> {
  const rows = await db
    .select({ n: lessonProgress.lessonNumber })
    .from(lessonProgress)
    .where(eq(lessonProgress.enrollmentId, enrollmentId));
  return rows.map((r) => r.n);
}

export async function getProgress(
  db: Executor,
  userId: string,
  courseId: string,
): Promise<CourseProgress> {
  const version = await publishedVersion(db, courseId);
  const enrollment = await findEnrollment(db, userId, courseId);
  const done = enrollment ? await completedNumbers(db, enrollment.id) : [];
  return summarize(courseId, version.total, enrollment, done);
}

/** Inscription à un cours publié. Idempotente : une seconde demande ne change rien. */
export async function enroll(
  db: Executor,
  userId: string,
  courseId: string,
): Promise<CourseProgress> {
  await publishedVersion(db, courseId);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(enrollments)
      .values({ userId, courseId })
      .onConflictDoNothing()
      .returning({ id: enrollments.id });
    // Évènement seulement pour une vraie inscription : un renvoi n'en produit pas.
    if (created) {
      await emit(tx, 'EnrollmentCreated', { enrollmentId: created.id, userId, courseId });
    }
  });
  return getProgress(db, userId, courseId);
}

async function enrolledLesson(db: Executor, userId: string, courseId: string, number: number) {
  const version = await publishedVersion(db, courseId);
  const enrollment = await findEnrollment(db, userId, courseId);
  if (!enrollment) {
    throw new LearningError('conflict', 'Inscrivez-vous d’abord à ce cours.');
  }
  if (number > version.total) throw new LearningError('not_found', 'Leçon introuvable.');
  return { version, enrollment };
}

/** Mémorise la dernière leçon ouverte, pour reprendre plus tard au même endroit. */
export async function lessonOpened(
  db: Executor,
  userId: string,
  courseId: string,
  number: number,
): Promise<void> {
  const { enrollment } = await enrolledLesson(db, userId, courseId, number);
  await db
    .update(enrollments)
    .set({ lastLessonNumber: number, updatedAt: sql`now()` })
    .where(eq(enrollments.id, enrollment.id));
}

/** Leçon terminée. Progression monotone : un double envoi ne crée aucun doublon. */
export async function lessonCompleted(
  db: Executor,
  userId: string,
  courseId: string,
  number: number,
): Promise<CourseProgress> {
  const { version, enrollment } = await enrolledLesson(db, userId, courseId, number);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(lessonProgress)
      .values({ enrollmentId: enrollment.id, lessonNumber: number, courseVersionId: version.id })
      .onConflictDoNothing()
      .returning({ id: lessonProgress.id });
    if (created) {
      await emit(tx, 'LessonCompleted', {
        enrollmentId: enrollment.id,
        userId,
        courseId,
        courseVersionId: version.id,
        lessonNumber: number,
      });
    }
    const next = number < version.total ? number + 1 : number;
    await tx
      .update(enrollments)
      .set({ lastLessonNumber: next, updatedAt: sql`now()` })
      .where(eq(enrollments.id, enrollment.id));
  });
  return getProgress(db, userId, courseId);
}

/** Cours suivis par la personne, le plus récemment utilisé d'abord (bouton « Reprendre »). */
export async function learningPlan(db: Executor, userId: string): Promise<LearningPlanItem[]> {
  const rows = await db
    .select({
      enrollment: enrollments,
      versionId: courseVersions.id,
      title: courseVersions.title,
      branch: courses.branch,
      total: sql<number>`(select count(*)::int from ${lessons} l where l.course_version_id = ${courseVersions.id})`,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(
      courseVersions,
      and(eq(courseVersions.courseId, courses.id), eq(courseVersions.status, 'published')),
    )
    .where(eq(enrollments.userId, userId))
    .orderBy(desc(enrollments.updatedAt), asc(courseVersions.title));
  return Promise.all(
    rows.map(async (r) => ({
      ...summarize(
        r.enrollment.courseId,
        r.total,
        r.enrollment,
        await completedNumbers(db, r.enrollment.id),
      ),
      title: r.title,
      branch: r.branch,
      enrolledAt: r.enrollment.enrolledAt.toISOString(),
    })),
  );
}
