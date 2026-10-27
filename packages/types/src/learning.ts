import { z } from 'zod';

/** Inscription et progression (cahier §6.2, §6.5 ; ticket 12). */

export const EnrollSchema = z.object({ courseId: z.uuid() });

/** Leçon terminée, repérée par son rang dans le plan du cours (comme le lecteur, ADR-008). */
export const LessonCompletedSchema = z.object({
  courseId: z.uuid(),
  lessonNumber: z.number().int().min(1).max(10_000),
});

/** Leçon ouverte : sert au bouton « Reprendre ». */
export const LessonOpenedSchema = LessonCompletedSchema;

export interface CourseProgress {
  courseId: string;
  enrolled: boolean;
  total: number;
  completed: number[];
  /** Leçon à reprendre : la dernière ouverte non terminée, sinon la première non terminée. */
  resumeAt: number | null;
  finished: boolean;
}

export interface LearningPlanItem extends CourseProgress {
  title: string;
  branch: string;
  enrolledAt: string;
}

/**
 * Action d'apprentissage envoyée par l'appareil (ticket 14, ADR-011). `operationId` est tiré par
 * l'appareil une fois pour toutes : un renvoi de la même action est reconnu et n'est pas rejoué.
 */
const EventBase = z.object({
  operationId: z.uuid(),
  courseId: z.uuid(),
  /** Heure de l'action sur l'appareil, utile quand elle a été faite hors ligne. */
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});
const LessonNumber = z.number().int().min(1).max(10_000);

export const LearningEventSchema = z.discriminatedUnion('type', [
  EventBase.extend({ type: z.literal('enrolled') }),
  EventBase.extend({ type: z.literal('lesson_opened'), lessonNumber: LessonNumber }),
  EventBase.extend({ type: z.literal('lesson_completed'), lessonNumber: LessonNumber }),
  EventBase.extend({
    type: z.literal('quiz_submitted'),
    lessonNumber: LessonNumber,
    answers: z
      .array(z.object({ questionId: z.uuid(), choice: z.number().int().min(0).max(3) }))
      .min(1)
      .max(10),
  }),
]);
export type LearningEventInput = z.infer<typeof LearningEventSchema>;

/** Lot d'actions, traitées dans l'ordre : une inscription peut précéder ses leçons terminées. */
export const LearningEventBatchSchema = z.object({
  events: z.array(LearningEventSchema).min(1).max(50),
});

export interface LearningEventResult {
  operationId: string;
  /** `applied` : prise en compte ; `duplicate` : déjà reçue ; `rejected` : refusée (message). */
  status: 'applied' | 'duplicate' | 'rejected';
  message?: string;
}
