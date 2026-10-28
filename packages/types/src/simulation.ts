import { z } from 'zod';

/**
 * Atelier virtuel : simulation de sécurité (cahier §4.3 « atelier virtuel de base », E2E-05 ;
 * ticket 18, ADR-014). Réussir la simulation ouvre la demande de séance pratique, toujours
 * encadrée par le formateur ; la simulation ne remplace jamais la pratique supervisée.
 */

/**
 * Réponses : pour chaque étape, les numéros choisis, dans l'ordre affiché.
 * - `identify` : un choix par question ;
 * - `equipment` : les équipements cochés ;
 * - `order` : les gestes, du premier au dernier.
 */
export const SimulationSubmissionSchema = z.object({
  attemptId: z.uuid(),
  steps: z
    .array(
      z.object({
        stepId: z.string().min(1).max(40),
        choices: z.array(z.number().int().min(0).max(11)).max(12),
      }),
    )
    .min(1)
    .max(10),
});
export type SimulationSubmission = z.infer<typeof SimulationSubmissionSchema>;

/** Étape de la simulation, sans le corrigé. */
export type SimulationStep =
  | {
      kind: 'identify';
      id: string;
      title: string;
      instructions: string;
      questions: Array<{ prompt: string; choices: string[] }>;
    }
  | { kind: 'equipment'; id: string; title: string; instructions: string; options: string[] }
  | { kind: 'order'; id: string; title: string; instructions: string; gestures: string[] };

export interface SimulationStepResult {
  stepId: string;
  title: string;
  passed: boolean;
  /** Ce qu'il faut revoir, en phrases simples (vide si l'étape est réussie). */
  feedback: string[];
}

export interface SimulationAttemptResult {
  passed: boolean;
  submittedAt: string;
  steps: SimulationStepResult[];
}

/**
 * - `locked` : séance pratique bloquée, la simulation n'est pas (ou plus) réussie ;
 * - `unlocked` : simulation réussie, la séance encadrée peut être demandée ;
 * - `requested` : demande enregistrée, le formateur organise la séance.
 */
export type PracticeStatus = 'locked' | 'unlocked' | 'requested';

export interface SimulationOverview {
  simulation: {
    code: string;
    title: string;
    curriculum: { code: string; label: string };
    /** Compétence de sécurité vérifiée par la simulation. */
    competency: { code: string; title: string };
    /** Compétence travaillée pendant la séance pratique encadrée qu'elle ouvre. */
    practice: { code: string; title: string };
  };
  steps: SimulationStep[];
  attempts: number;
  lastAttempt: SimulationAttemptResult | null;
  practice: { status: PracticeStatus; requestedAt: string | null };
}
