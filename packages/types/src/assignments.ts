import { z } from 'zod';

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

export interface MySubmission {
  id: string;
  body: string;
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
}

export interface SubmissionRow {
  learnerId: string;
  learnerName: string;
  submission: (MySubmission & { id: string }) | null;
}

export interface AssignmentReview {
  assignment: AssignmentItem;
  rows: SubmissionRow[];
}
