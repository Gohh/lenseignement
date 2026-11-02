import { z } from 'zod';
import {
  EXERCISE_DIFFICULTIES,
  EXERCISE_DOMAINS,
  EXERCISE_KINDS,
  EXERCISE_SKILLS,
} from './exercises.js';

// Aide de l'IA pour rédiger des exercices : éteinte par défaut, branchée par le
// superadministrateur. Seule la fiche de la compétence part chez le fournisseur, jamais une
// donnée d'élève ; tout ce qu'elle propose arrive en brouillon et passe par la relecture.

export const AI_PROVIDERS = ['mistral', 'anthropic', 'openai', 'local'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  mistral: 'Mistral AI (entreprise française)',
  anthropic: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  local: 'Modèle libre sur votre serveur (Ollama ou autre)',
};

/** Modèle proposé quand le champ est vide (à vérifier sur le site du fournisseur). */
export const AI_DEFAULT_MODELS: Record<AiProvider, string> = {
  mistral: 'mistral-small-latest',
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-4.1-mini',
  local: 'qwen2.5:7b',
};

/** Adresse de l'API du fournisseur ; pour un modèle libre, celle de votre serveur. */
export const AI_DEFAULT_URLS: Record<AiProvider, string> = {
  mistral: 'https://api.mistral.ai/v1',
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  local: 'http://localhost:11434/v1',
};

/** Réglages vus par le superadministrateur : la clé n'est jamais renvoyée, seulement sa fin. */
export interface AiSettingsView {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  /** Quatre derniers caractères de la clé enregistrée. */
  keyHint: string | null;
  dailyLimit: number;
  usedToday: number;
  updatedAt: string | null;
}

export const AI_MAX_DAILY = 500;

export const UpdateAiSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(AI_PROVIDERS),
  model: z.string().trim().max(80).default(''),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine(
      (v) => v === '' || /^https?:\/\/[^\s]+$/.test(v),
      'Adresse invalide (http:// ou https://).',
    )
    .default(''),
  /** Vide : garder la clé enregistrée. */
  apiKey: z.string().trim().max(400).default(''),
  removeKey: z.boolean().default(false),
  dailyLimit: z.number().int().min(1).max(AI_MAX_DAILY).default(30),
});
export type UpdateAiSettingsInput = z.infer<typeof UpdateAiSettingsSchema>;

/** Ce que voit une personne qui rédige : l'IA est-elle branchée, combien reste-t-il aujourd'hui. */
export interface AiStatus {
  enabled: boolean;
  providerLabel: string | null;
  remaining: number;
}

/** Types d'exercice que l'IA sait proposer (pas « Écouter, regarder » : il faut un fichier). */
export const AI_EXERCISE_KINDS = EXERCISE_KINDS.filter((k) => k !== 'media');
export const AI_MAX_EXERCISES = 5;

export const GenerateExercisesSchema = z.object({
  organizationId: z.uuid(),
  competencyId: z.uuid({ message: 'Choisissez la compétence.' }),
  domain: z.enum(EXERCISE_DOMAINS),
  difficulty: z.enum(EXERCISE_DIFFICULTIES),
  skill: z.enum(EXERCISE_SKILLS),
  kind: z.enum(EXERCISE_KINDS).refine((k) => k !== 'media', 'Type non proposé par l’IA.'),
  count: z.number().int().min(1).max(AI_MAX_EXERCISES).default(3),
  /** Précisions de l'enseignant (contexte, thème) ; jamais de nom d'élève. */
  notes: z.string().trim().max(500).default(''),
});
export type GenerateExercisesInput = z.infer<typeof GenerateExercisesSchema>;

export interface GenerateExercisesResult {
  created: number;
  ids: string[];
  errors: Array<{ index: number; title: string; message: string }>;
}

/** Résultat de « Essayer la connexion ». */
export interface AiTestResult {
  ok: boolean;
  message: string;
}
