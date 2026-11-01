import { z } from 'zod';

/**
 * Ateliers (proposition validée par GOHH le 01/11/2026) : l'atelier virtuel s'ouvre à tous les
 * métiers. Un auteur (enseignant, technopédagogue…) le rédige depuis la plateforme, l'envoie en
 * relecture, et la direction ou le référent le publie. Chaque publication fige une version : les
 * essais des élèves restent rattachés à ce qu'ils ont vraiment fait.
 */

export const WORKSHOP_TRADES = [
  'electricite',
  'mecanique',
  'menuiserie',
  'couture',
  'soudure',
  'batiment',
  'agriculture',
  'cuisine',
  'informatique',
  'sante',
  'autre',
] as const;
export type WorkshopTrade = (typeof WORKSHOP_TRADES)[number];

export const WORKSHOP_TRADE_LABELS: Record<WorkshopTrade, string> = {
  electricite: 'Électricité',
  mecanique: 'Mécanique',
  menuiserie: 'Menuiserie',
  couture: 'Couture',
  soudure: 'Soudure',
  batiment: 'Bâtiment',
  agriculture: 'Agriculture',
  cuisine: 'Cuisine et hygiène',
  informatique: 'Informatique',
  sante: 'Santé',
  autre: 'Autre métier',
};

export const WORKSHOP_TRADE_ICONS: Record<WorkshopTrade, string> = {
  electricite: '⚡',
  mecanique: '🔧',
  menuiserie: '🪚',
  couture: '🧵',
  soudure: '🔥',
  batiment: '🧱',
  agriculture: '🌱',
  cuisine: '🍲',
  informatique: '💻',
  sante: '🩺',
  autre: '🛠️',
};

/**
 * - `draft` : en rédaction (une version déjà publiée reste en ligne pendant ce temps) ;
 * - `review` : envoyé en relecture, plus modifiable ;
 * - `published` : en ligne, tel qu'il a été relu ;
 * - `archived` : retiré du catalogue, l'historique reste.
 */
export const WORKSHOP_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];

export const WORKSHOP_STATUS_LABELS: Record<WorkshopStatus, string> = {
  draft: 'Brouillon',
  review: 'En relecture',
  published: 'Publié',
  archived: 'Retiré',
};

export const WORKSHOP_STEP_KINDS = ['identify', 'equipment', 'order'] as const;
export type WorkshopStepKind = (typeof WORKSHOP_STEP_KINDS)[number];

export const WORKSHOP_STEP_KIND_LABELS: Record<WorkshopStepKind, string> = {
  identify: 'Reconnaître',
  equipment: 'Choisir l’équipement',
  order: 'Remettre dans l’ordre',
};

export const WORKSHOP_STEP_KIND_HINTS: Record<WorkshopStepKind, string> = {
  identify: 'Des questions à choix : une seule bonne réponse par question.',
  equipment: 'Une liste d’équipements : l’élève coche ceux qu’il faut prendre.',
  order: 'Des gestes à remettre dans le bon ordre.',
};

const text = (max: number) => z.string().trim().min(1, 'Champ à remplir.').max(max);
const note = (max: number) => z.string().trim().max(max).default('');

/**
 * Étape telle que l'auteur l'écrit, avec son corrigé (jamais envoyée à l'élève) :
 * - `identify` : questions, choix et numéro de la bonne réponse ;
 * - `equipment` : chaque équipement, s'il faut le prendre, et pourquoi ;
 * - `order` : les gestes dans le BON ordre ; l'ordre affiché est mélangé à la publication.
 */
export const WorkshopStepInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('identify'),
    title: text(120),
    instructions: note(400),
    questions: z
      .array(
        z
          .object({
            prompt: text(300),
            choices: z.array(text(200)).min(2, 'Au moins deux réponses.').max(6),
            correct: z.number().int().min(0),
            explanation: note(400),
          })
          .refine((q) => q.correct < q.choices.length, 'Choisissez la bonne réponse.'),
      )
      .min(1, 'Au moins une question.')
      .max(6),
  }),
  z.object({
    kind: z.literal('equipment'),
    title: text(120),
    instructions: note(400),
    options: z
      .array(z.object({ label: text(160), needed: z.boolean(), explanation: note(300) }))
      .min(2, 'Au moins deux équipements.')
      .max(12)
      .refine((o) => o.some((x) => x.needed), 'Cochez au moins un équipement à prendre.'),
  }),
  z.object({
    kind: z.literal('order'),
    title: text(120),
    instructions: note(400),
    gestures: z
      .array(z.object({ label: text(200), explanation: note(300) }))
      .min(2, 'Au moins deux gestes.')
      .max(8),
  }),
]);
export type WorkshopStepInput = z.infer<typeof WorkshopStepInputSchema>;

const Trade = z.enum(WORKSHOP_TRADES);

export const CreateWorkshopSchema = z.object({
  organizationId: z.uuid(),
  trade: Trade,
  title: text(120),
});
export type CreateWorkshopInput = z.infer<typeof CreateWorkshopSchema>;

/** Enregistrement d'un brouillon : la fiche et toutes ses étapes d'un coup. */
export const UpdateWorkshopSchema = z.object({
  trade: Trade,
  title: text(120),
  summary: note(400),
  /** Compétence d'un programme publié, ou null. */
  competencyId: z.uuid().nullable().default(null),
  /** Une séance pratique avec le formateur suit la réussite en ligne. */
  practice: z.boolean(),
  steps: z.array(WorkshopStepInputSchema).max(10, 'Dix étapes au plus.'),
});
export type UpdateWorkshopInput = z.infer<typeof UpdateWorkshopSchema>;

export const WorkshopReturnSchema = z.object({ note: text(600) });

export interface WorkshopSummary {
  id: string;
  title: string;
  trade: WorkshopTrade;
  status: WorkshopStatus;
  organization: { id: string; name: string };
  author: string | null;
  stepCount: number;
  /** Une version publiée est en ligne (même si un brouillon est en cours). */
  live: boolean;
  reviewNote: string | null;
  updatedAt: string;
  /** La personne peut publier ou renvoyer cet atelier (rôle, et pas son propre travail). */
  canPublish: boolean;
}

export interface WorkshopDetail extends WorkshopSummary {
  summary: string;
  competency: { id: string; code: string; title: string; curriculum: string } | null;
  practice: boolean;
  steps: WorkshopStepInput[];
  /** Code de la version en ligne, pour l'aperçu élève. */
  liveCode: string | null;
  canEdit: boolean;
}

export interface WorkshopCompetencyOption {
  id: string;
  code: string;
  title: string;
  curriculum: string;
}

/**
 * Où en est l'élève : `todo` (jamais essayé), `retry` (dernier essai pas encore réussi),
 * `passed` (réussi en ligne), `practice` (séance pratique demandée).
 */
export type WorkshopProgress = 'todo' | 'retry' | 'passed' | 'practice';

export interface WorkshopCard {
  code: string;
  title: string;
  trade: WorkshopTrade;
  summary: string;
  stepCount: number;
  practice: boolean;
  progress: WorkshopProgress;
}
