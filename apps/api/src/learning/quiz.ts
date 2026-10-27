import type {
  QuizAnswersInput,
  QuizAttemptInput,
  QuizLastAttempt,
  QuizResult,
} from '@lenseignement/types';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  courseModules,
  lessons,
  quizAttempts,
  quizQuestions,
  quizResponses,
} from '../db/schema.js';
import { findEnrollment, LearningError, publishedVersion } from './learning.js';

/** Questions (avec leurs réponses) de la leçon n° `number` de la version publiée d'un cours. */
async function lessonQuiz(db: Database, courseId: string, number: number) {
  const version = await publishedVersion(db, courseId);
  const ordered = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .where(eq(lessons.courseVersionId, version.id))
    .orderBy(asc(courseModules.position), asc(lessons.position));
  const lesson = ordered[number - 1];
  if (!lesson) throw new LearningError('not_found', 'Leçon introuvable.');
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.lessonId, lesson.id))
    .orderBy(asc(quizQuestions.position));
  if (questions.length === 0) throw new LearningError('not_found', 'Cette leçon n’a pas de quiz.');
  return { versionId: version.id, questions };
}

type Question = typeof quizQuestions.$inferSelect;

/** Correction : une réponse, et une seule, pour chaque question du quiz. */
function grade(questions: Question[], answers: QuizAnswersInput['answers']): QuizResult {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a.choice]));
  if (byQuestion.size !== answers.length || byQuestion.size !== questions.length) {
    throw new LearningError('invalid', 'Répondez à chaque question, une seule fois.');
  }
  const items = questions.map((q) => {
    const choice = byQuestion.get(q.id);
    if (choice === undefined || choice >= q.choices.length) {
      throw new LearningError('invalid', 'Répondez à chaque question, une seule fois.');
    }
    return {
      questionId: q.id,
      choice,
      correct: choice === q.correctChoice,
      correctChoice: q.correctChoice,
      explanation: q.explanation,
    };
  });
  return { score: items.filter((i) => i.correct).length, total: items.length, items };
}

/** Correction sans enregistrement : quiz d'un cours publié, ouvert à tous (cahier E2E-01). */
export async function checkQuiz(db: Database, input: QuizAnswersInput): Promise<QuizResult> {
  const { questions } = await lessonQuiz(db, input.courseId, input.lessonNumber);
  return grade(questions, input.answers);
}

/**
 * Tentative d'une personne inscrite, corrigée puis enregistrée. Idempotente : un renvoi de la même
 * tentative rend la correction déjà enregistrée, sans rien ajouter.
 */
export async function recordAttempt(
  db: Database,
  userId: string,
  input: QuizAttemptInput,
): Promise<QuizResult> {
  const { versionId, questions } = await lessonQuiz(db, input.courseId, input.lessonNumber);
  if (!(await findEnrollment(db, userId, input.courseId))) {
    throw new LearningError('conflict', 'Inscrivez-vous d’abord à ce cours.');
  }
  const result = grade(questions, input.answers);
  const stored = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(quizAttempts)
      .values({
        id: input.attemptId,
        userId,
        courseId: input.courseId,
        courseVersionId: versionId,
        lessonNumber: input.lessonNumber,
        score: result.score,
        total: result.total,
      })
      .onConflictDoNothing()
      .returning({ id: quizAttempts.id });
    if (!created) return false;
    await tx.insert(quizResponses).values(
      result.items.map((i) => ({
        attemptId: input.attemptId,
        questionId: i.questionId,
        choice: i.choice,
        correct: i.correct,
      })),
    );
    return true;
  });
  if (stored) return { ...result, attemptId: input.attemptId };

  // Déjà reçue : on rend ce qui a été enregistré la première fois, et à son auteur seulement.
  const [existing] = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.id, input.attemptId), eq(quizAttempts.userId, userId)));
  if (!existing) throw new LearningError('conflict', 'Tentative déjà enregistrée.');
  // Questions de la version de cette tentative (figées), même si une nouvelle version est publiée.
  const responses = await db
    .select({ response: quizResponses, question: quizQuestions })
    .from(quizResponses)
    .innerJoin(quizQuestions, eq(quizQuestions.id, quizResponses.questionId))
    .where(eq(quizResponses.attemptId, existing.id))
    .orderBy(asc(quizQuestions.position));
  return {
    score: existing.score,
    total: existing.total,
    items: responses.map(({ response, question }) => ({
      questionId: question.id,
      choice: response.choice,
      correct: response.correct,
      correctChoice: question.correctChoice,
      explanation: question.explanation,
    })),
    attemptId: existing.id,
  };
}

/** Dernier résultat de la personne à ce quiz, ou rien. */
export async function lastAttempt(
  db: Database,
  userId: string,
  courseId: string,
  lessonNumber: number,
): Promise<QuizLastAttempt | null> {
  const [row] = await db
    .select({
      score: quizAttempts.score,
      total: quizAttempts.total,
      submittedAt: quizAttempts.submittedAt,
    })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.courseId, courseId),
        eq(quizAttempts.lessonNumber, lessonNumber),
      ),
    )
    .orderBy(desc(quizAttempts.submittedAt))
    .limit(1);
  return row ? { ...row, submittedAt: row.submittedAt.toISOString() } : null;
}
