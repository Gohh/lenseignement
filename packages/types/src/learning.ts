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
