import { z } from 'zod';
import {
  ExerciseAnswerSchema,
  type ExerciseDomain,
  type ExerciseKind,
  type ExercisePlay,
} from './exercises.js';

/** Devoirs : l'enseignant donne un travail à une classe, l'élève le rend, l'enseignant le corrige. */

export const CreateAssignmentSchema = z.object({
  title: z.string().trim().min(2, 'Donnez un titre au devoir.').max(120),
  instructions: z.string().trim().min(3, 'Écrivez la consigne.').max(4000),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  maxScore: z.number().int().min(1).max(100).default(20),
});

export const SubmitAssignmentSchema = z.object({
  body: z.string().trim().min(1, 'Écris ta réponse.').max(8000),
});

export const GradeSubmissionSchema = z.object({
  score: z.number().min(0).max(100),
  comment: z.string().trim().max(2000).optional(),
});

/** Résultat d'un exercice de la Fabrique dans un devoir, corrigé par la plateforme. */
export interface AssignmentExerciseResult {
  exerciseId: string;
  title: string;
  correct: boolean;
  score: number;
  feedback: string[];
}

export interface MySubmission {
  id: string;
  body: string;
  /** Devoir fait d'exercices : le détail de la correction automatique. */
  results: AssignmentExerciseResult[] | null;
  submittedAt: string;
  score: number | null;
  comment: string | null;
  gradedAt: string | null;
}

export interface AssignmentItem {
  id: string;
  cohortId: string;
  cohortName: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  maxScore: number;
  createdAt: string;
  teacherName: string | null;
  /** L'enseignant ou la direction peut corriger et supprimer. */
  canManage: boolean;
  /** Ce que l'élève a rendu ; null s'il n'a rien rendu (ou pour l'enseignant). */
  mine: MySubmission | null;
  /** Pour l'enseignant : élèves de la classe, copies rendues et corrigées. */
  learnerCount: number;
  submittedCount: number;
  gradedCount: number;
  /** Exercices de la Fabrique à faire (0 : devoir à rédiger). */
  exerciseCount: number;
}

export interface SubmissionRow {
  learnerId: string;
  learnerName: string;
  submission: (MySubmission & { id: string }) | null;
}

export interface AssignmentExerciseSummary {
  id: string;
  title: string;
  kind: ExerciseKind;
  domain: ExerciseDomain;
  competency: string;
}

export interface AssignmentReview {
  assignment: AssignmentItem;
  rows: SubmissionRow[];
  exercises: AssignmentExerciseSummary[];
  /** Plus d'ajout ni de retrait d'exercice une fois qu'un élève a rendu. */
  exercisesLocked: boolean;
}

/** Nombre maximal d'exercices dans un devoir. */
export const ASSIGNMENT_MAX_EXERCISES = 40;

export const AddAssignmentExerciseSchema = z.object({ exerciseId: z.uuid() });

/** Réponses de l'élève aux exercices d'un devoir, dans l'ordre du devoir. */
export const AssignmentAnswersSchema = z.object({
  /** Identifiant de l'envoi : un renvoi (hors ligne, double clic) n'est compté qu'une fois. */
  attemptId: z.uuid(),
  answers: z.array(ExerciseAnswerSchema).min(1).max(ASSIGNMENT_MAX_EXERCISES),
});
export type AssignmentAnswers = z.infer<typeof AssignmentAnswersSchema>;

/** Ce que l'élève reçoit pour faire le devoir : les exercices sans leur corrigé. */
export interface AssignmentWork {
  assignment: AssignmentItem;
  exercises: Array<{ id: string; title: string; play: ExercisePlay }>;
}

/**
 * Devoir fait sans réseau, gardé sur l'appareil puis envoyé au retour d'internet. L'identifiant
 * d'opération sert d'identifiant d'envoi.
 */
export const AssignmentAnswersEventSchema = z.object({
  type: z.literal('assignment_answers'),
  operationId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  assignmentId: z.uuid(),
  answers: AssignmentAnswersSchema.shape.answers,
});
export type AssignmentAnswersEvent = z.infer<typeof AssignmentAnswersEventSchema>;
