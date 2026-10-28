import { z } from 'zod';

/**
 * Bilan diagnostique et rattrapage (cahier §6.6, §7 « moteur de recommandation V1 », E2E-04 ;
 * ticket 17, ADR-013). Tout est rattaché à la version exacte des compétences du programme.
 */

const Answers = z
  .array(z.object({ itemId: z.uuid(), choice: z.number().int().min(0).max(3) }))
  .min(1)
  .max(40);

/** Bilan ou petit test de vérification : identifiant tiré par l'appareil (renvoi sans doublon). */
export const DiagnosticSubmissionSchema = z.object({
  sessionId: z.uuid(),
  answers: Answers,
});
export type DiagnosticSubmission = z.infer<typeof DiagnosticSubmissionSchema>;

/** Correction de l'orientation par l'enseignant : une compétence du bilan, et pourquoi. */
export const RemediationOverrideSchema = z.object({
  competencyCode: z.string().min(1).max(40),
  reason: z.string().trim().min(5, 'Expliquez votre choix en quelques mots.').max(500),
});
export type RemediationOverride = z.infer<typeof RemediationOverrideSchema>;

/** Question du bilan, sans la bonne réponse. */
export interface DiagnosticItem {
  id: string;
  competencyCode: string;
  prompt: string;
  choices: string[];
}

export interface DiagnosticForm {
  code: string;
  title: string;
  /** Programme et version auxquels les compétences sont rattachées. */
  curriculum: { code: string; label: string };
  items: DiagnosticItem[];
}

/** Résultat par compétence. « À consolider » plutôt qu'« échec » (cahier §3, bienveillance). */
export interface SkillResult {
  code: string;
  title: string;
  correct: number;
  total: number;
  mastered: boolean;
}

export interface RemediationPlan {
  id: string;
  status: 'active' | 'completed' | 'replaced';
  /** `rule` : proposé par la règle du bilan ; `teacher` : choisi par un enseignant. */
  source: 'rule' | 'teacher';
  competency: { code: string; title: string };
  course: { id: string; title: string } | null;
  /** Explication en phrases simples, figée au moment de la proposition. */
  rationale: string[];
  /** Enseignant qui a corrigé l'orientation, et pourquoi (source `teacher`). */
  decidedBy: string | null;
  reason: string | null;
  createdAt: string;
}

export interface PostTestResult {
  score: number;
  total: number;
  mastered: boolean;
  submittedAt: string;
}

export interface RemediationOverview {
  diagnostic: { code: string; title: string; curriculum: { code: string; label: string } };
  /** Dernier bilan : date et résultats par compétence ; null s'il n'a jamais été passé. */
  latest: { submittedAt: string; results: SkillResult[] } | null;
  /** Plan en cours, ou le dernier terminé. */
  plan: RemediationPlan | null;
  /** Dernier petit test de vérification du plan affiché. */
  postTest: PostTestResult | null;
  /** Vrai pour le personnel du périmètre de l'élève : il peut corriger l'orientation. */
  canAdjust: boolean;
}
