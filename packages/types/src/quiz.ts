import { z } from 'zod';

/** Réponses à un quiz de leçon (ticket 13, ADR-010) : un choix par question. */
export const QuizAnswersSchema = z.object({
  courseId: z.uuid(),
  lessonNumber: z.number().int().min(1).max(10_000),
  answers: z
    .array(z.object({ questionId: z.uuid(), choice: z.number().int().min(0).max(3) }))
    .min(1)
    .max(10),
});
export type QuizAnswersInput = z.infer<typeof QuizAnswersSchema>;

/**
 * Tentative enregistrée pour une personne inscrite. L'identifiant est choisi par l'appareil :
 * un renvoi (double clic, réseau coupé puis rétabli) ne crée pas de seconde tentative.
 */
export const QuizAttemptSchema = QuizAnswersSchema.extend({ attemptId: z.uuid() });
export type QuizAttemptInput = z.infer<typeof QuizAttemptSchema>;

export interface QuizResult {
  score: number;
  total: number;
  items: Array<{
    questionId: string;
    choice: number;
    correct: boolean;
    correctChoice: number;
    explanation: string;
  }>;
  /** Présent quand la tentative a été enregistrée. */
  attemptId?: string;
}

export interface QuizLastAttempt {
  score: number;
  total: number;
  submittedAt: string;
}
