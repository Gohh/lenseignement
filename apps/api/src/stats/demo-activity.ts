import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { DEMO_IDS as ID } from '../db/demo-data.js';
import { diagnosticItems, lessons, memberships, quizQuestions, users } from '../db/schema.js';
import { enroll, lessonCompleted, publishedVersion } from '../learning/learning.js';
import { recordAttempt } from '../learning/quiz.js';
import { DEMO_DIAGNOSTIC } from '../remediation/demo-diagnostic.js';
import {
  diagnosticForm,
  postTestForm,
  submitDiagnostic,
  submitPostTest,
} from '../remediation/remediation.js';
import { DEMO_SIMULATION } from '../simulation/demo-simulation.js';
import { requestPractice, submitAttempt } from '../simulation/simulation.js';

/** Nombre d'élèves fictifs de l'activité de démonstration. */
export const DEMO_ACTIVITY_LEARNERS = 12;

const learnerId = (i: number) =>
  `40000000-0000-4000-8000-0000000002${String(i + 1).padStart(2, '0')}`;

/** Réponses de la simulation : justes, ou avec la montre gardée. */
const SIMULATION = (right: boolean) => [
  { stepId: 'materiel', choices: [1, 0, 1] },
  { stepId: 'epi', choices: right ? [0, 1, 2] : [0, 1, 2, 3] },
  { stepId: 'consignation', choices: [1, 4, 2, 0, 3] },
];

/**
 * Activité FICTIVE pour le tableau de chiffres (ticket 20, ADR-016) : douze élèves sans compte
 * de connexion, rattachés à l'École Les Manguiers, suivent « Additionner jusqu'à 10 », passent
 * le bilan de lecture et l'atelier virtuel. Assez de monde pour dépasser le seuil de 5 ;
 * passe par les mêmes règles que l'application. Idempotent.
 */
export async function seedDemoActivity(db: Database): Promise<void> {
  const ids = Array.from({ length: DEMO_ACTIVITY_LEARNERS }, (_, i) => learnerId(i));
  const created = await db
    .insert(users)
    .values(
      ids.map((id, i) => ({
        id,
        oidcSubject: `seed:stats-${i + 1}`,
        accountType: 'minor' as const,
        displayName: `Élève fictif ${i + 1}`,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created.length === 0) return;
  await db
    .insert(memberships)
    .values(
      ids.map((userId) => ({
        userId,
        organizationId: ID.orgManguiers,
        role: 'apprenant' as const,
      })),
    )
    .onConflictDoNothing();

  // Cours : 12 inscrits, 10 commencent (quiz de la leçon 1), 7 terminent.
  const course = ID.courseAdditions;
  const version = await publishedVersion(db, course);
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.courseVersionId, version.id))
    .orderBy(asc(quizQuestions.position));
  // Un seul module : l'ordre des leçons est celui de leur position.
  const plan = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.courseVersionId, version.id))
    .orderBy(asc(lessons.position));
  const quiz = async (userId: string, lessonNumber: number, allRight: boolean) => {
    const lesson = plan[lessonNumber - 1]!;
    const mine = questions.filter((q) => q.lessonId === lesson.id);
    await recordAttempt(db, userId, {
      courseId: course,
      lessonNumber,
      attemptId: randomUUID(),
      answers: mine.map((q, k) => ({
        questionId: q.id,
        choice: allRight || k > 0 ? q.correctChoice : (q.correctChoice + 1) % q.choices.length,
      })),
    });
  };

  // Bonnes réponses du bilan (diagnostic) et du petit test, connues de la base.
  const correctOf = new Map(
    (
      await db
        .select({ id: diagnosticItems.id, correct: diagnosticItems.correctChoice })
        .from(diagnosticItems)
    ).map((r) => [r.id, r.correct]),
  );
  const answer = (items: Array<{ id: string; competencyCode: string }>, wrong: string[]) =>
    items.map((item) => {
      const correct = correctOf.get(item.id)!;
      return {
        itemId: item.id,
        choice: wrong.includes(item.competencyCode) ? (correct + 1) % 2 : correct,
      };
    });
  const diagnostic = await diagnosticForm(db, DEMO_DIAGNOSTIC);

  for (const [i, userId] of ids.entries()) {
    await enroll(db, userId, course);
    if (i < 10) {
      await lessonCompleted(db, userId, course, 1);
      await quiz(userId, 1, i % 3 !== 0);
    }
    if (i < 7) {
      await lessonCompleted(db, userId, course, 2);
      await quiz(userId, 2, true);
    }
    // Bilan : 8 élèves, syllabes à consolider ; 5 réussissent ensuite le petit test.
    if (i < 8) {
      await submitDiagnostic(db, userId, DEMO_DIAGNOSTIC, {
        sessionId: randomUUID(),
        answers: answer(diagnostic.items, ['LECT-02']),
      });
    }
    if (i < 5) {
      const post = await postTestForm(db, userId, DEMO_DIAGNOSTIC);
      await submitPostTest(db, userId, DEMO_DIAGNOSTIC, {
        sessionId: randomUUID(),
        answers: answer(post.items, []),
      });
    }
    // Atelier : 8 essaient, 6 réussissent, 5 demandent leur séance encadrée.
    if (i < 8) {
      await submitAttempt(db, userId, DEMO_SIMULATION, {
        attemptId: randomUUID(),
        steps: SIMULATION(i < 6),
      });
    }
    if (i < 5) await requestPractice(db, userId, DEMO_SIMULATION);
  }
}
