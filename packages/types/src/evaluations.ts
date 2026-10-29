import { z } from 'zod';

/** Évaluations : contrôles notés d'une classe, avec carnet de notes par élève. */

export const CreateEvaluationSchema = z.object({
  title: z.string().trim().min(2, 'Donnez un titre à l’évaluation.').max(120),
  subject: z.string().trim().max(60).optional(),
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisissez la date de l’évaluation.'),
  maxScore: z.number().int().min(1).max(100).default(20),
  coefficient: z.number().int().min(1).max(10).default(1),
});

export const SaveScoresSchema = z.object({
  scores: z
    .array(
      z.object({
        learnerId: z.uuid(),
        /** null pour effacer la note (absent, pas encore noté). */
        score: z.number().min(0).max(100).nullable(),
        comment: z.string().trim().max(500).optional(),
      }),
    )
    .max(500),
});

export interface EvaluationItem {
  id: string;
  cohortId: string;
  cohortName: string;
  title: string;
  subject: string | null;
  heldOn: string;
  maxScore: number;
  coefficient: number;
  teacherName: string | null;
  canManage: boolean;
  /** Ma note et mon commentaire (élève) ; null si pas encore noté. */
  myScore: number | null;
  myComment: string | null;
  /** Moyenne de la classe sur le maximum, quand au moins une note est saisie. */
  classAverage: number | null;
  learnerCount: number;
  scoredCount: number;
}

export interface EvaluationSheet {
  evaluation: EvaluationItem;
  rows: { learnerId: string; learnerName: string; score: number | null; comment: string | null }[];
}

/** Moyenne pondérée ramenée sur 20 des évaluations notées ; null s'il n'y en a aucune. */
export function weightedAverage(
  items: readonly Pick<EvaluationItem, 'myScore' | 'maxScore' | 'coefficient'>[],
): number | null {
  let total = 0;
  let weights = 0;
  for (const e of items) {
    if (e.myScore === null) continue;
    total += (e.myScore / e.maxScore) * 20 * e.coefficient;
    weights += e.coefficient;
  }
  return weights === 0 ? null : Math.round((total / weights) * 100) / 100;
}
