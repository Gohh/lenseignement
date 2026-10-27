import type { LearningEventInput, LearningEventResult } from '@lenseignement/types';
import type { Database, Tx } from '../db/database.js';
import { learningEvents } from '../db/schema.js';
import { enroll, LearningError, lessonCompleted, lessonOpened } from './learning.js';
import { recordAttempt } from './quiz.js';

async function apply(tx: Tx, userId: string, event: LearningEventInput): Promise<void> {
  switch (event.type) {
    case 'enrolled':
      await enroll(tx, userId, event.courseId);
      return;
    case 'lesson_opened':
      await lessonOpened(tx, userId, event.courseId, event.lessonNumber);
      return;
    case 'lesson_completed':
      await lessonCompleted(tx, userId, event.courseId, event.lessonNumber);
      return;
    case 'quiz_submitted':
      // L'identifiant de l'action sert d'identifiant de tentative.
      await recordAttempt(tx, userId, {
        attemptId: event.operationId,
        courseId: event.courseId,
        lessonNumber: event.lessonNumber,
        answers: event.answers,
      });
  }
}

/** Ce qui est gardé dans le journal : jamais les réponses (elles sont dans `quiz_responses`). */
function payloadOf(event: LearningEventInput): Record<string, unknown> {
  return 'lessonNumber' in event ? { lessonNumber: event.lessonNumber } : {};
}

class Duplicate extends Error {}

/**
 * Applique un lot d'actions, une par une et dans l'ordre (ADR-011). Chaque action est enregistrée
 * dans le journal et appliquée dans la même transaction : si elle est refusée, rien n'en reste et
 * l'appareil peut la renvoyer plus tard ; si elle a déjà été reçue, elle n'est pas rejouée.
 */
export async function applyLearningEvents(
  db: Database,
  userId: string,
  events: LearningEventInput[],
): Promise<LearningEventResult[]> {
  const results: LearningEventResult[] = [];
  for (const event of events) {
    try {
      await db.transaction(async (tx) => {
        const [logged] = await tx
          .insert(learningEvents)
          .values({
            userId,
            courseId: event.courseId,
            eventType: event.type,
            clientOperationId: event.operationId,
            payload: payloadOf(event),
            occurredAt: event.occurredAt ? new Date(event.occurredAt) : null,
          })
          .onConflictDoNothing()
          .returning({ id: learningEvents.id });
        if (!logged) throw new Duplicate();
        await apply(tx, userId, event);
      });
      results.push({ operationId: event.operationId, status: 'applied' });
    } catch (error) {
      if (error instanceof Duplicate) {
        results.push({ operationId: event.operationId, status: 'duplicate' });
      } else if (error instanceof LearningError) {
        results.push({
          operationId: event.operationId,
          status: 'rejected',
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }
  return results;
}
