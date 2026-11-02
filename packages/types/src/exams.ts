import { z } from 'zod';
import {
  EXERCISE_DOMAINS,
  type ExerciseDifficulty,
  type ExerciseDomain,
  type ExerciseKind,
  type ExercisePlay,
  type ExerciseSkill,
} from './exercises.js';

// Épreuves « type PASEC, TIMSS, ENIA » (étape 4 de la Fabrique) : une série d'exercices publiés
// de la banque, choisie selon les parts par domaine d'un modèle. Elle se fait passer comme un
// devoir (en ligne, ou sur l'appareil sans connexion) et se lit par domaine, par façon de penser
// et en « % d'élèves au-dessus du seuil ». Les modèles reprennent les PARTS publiées des grands
// cadres d'évaluation ; les questions sont toujours celles de la banque, jamais des items copiés.

export const EXAM_MODELS = [
  'pasec-debut-langue',
  'pasec-debut-maths',
  'pasec-fin-lecture',
  'pasec-fin-maths',
  'timss-4-maths',
  'enia-college-francais',
  'enia-college-maths',
  'libre',
] as const;
export type ExamModel = (typeof EXAM_MODELS)[number];

export interface ExamModelInfo {
  label: string;
  hint: string;
  shares: Partial<Record<ExerciseDomain, number>>;
}

export const EXAM_MODEL_INFO: Record<ExamModel, ExamModelInfo> = {
  'pasec-debut-langue': {
    label: 'Type PASEC début de primaire · langue',
    hint: 'CP2 : écouter, décoder, comprendre un texte court.',
    shares: { 'comprehension-orale': 37, decodage: 28, 'comprehension-ecrit': 35 },
  },
  'pasec-debut-maths': {
    label: 'Type PASEC début de primaire · maths',
    hint: 'CP2 : compter, comparer, calculer ; un peu d’espace et de mesure.',
    shares: { 'nombres-operations': 73, 'geometrie-espace': 14, 'grandeurs-mesures': 13 },
  },
  'pasec-fin-lecture': {
    label: 'Type PASEC fin de primaire · lecture',
    hint: 'CM2 : mots et phrases, puis surtout compréhension de textes.',
    shares: { decodage: 16, 'comprehension-ecrit': 84 },
  },
  'pasec-fin-maths': {
    label: 'Type PASEC fin de primaire · maths',
    hint: 'CM2 : nombres et opérations, grandeurs et mesures, géométrie.',
    shares: { 'nombres-operations': 48, 'grandeurs-mesures': 35, 'geometrie-espace': 17 },
  },
  'timss-4-maths': {
    label: 'Type TIMSS 4e année · maths',
    hint: 'CM1 : nombres, mesure et géométrie, lire des données.',
    shares: {
      'nombres-operations': 50,
      'grandeurs-mesures': 15,
      'geometrie-espace': 15,
      donnees: 20,
    },
  },
  'enia-college-francais': {
    label: 'Type ENIA collège · français',
    hint: 'Collège : compréhension de l’écrit, langue et écriture. Parts réglables.',
    shares: { 'comprehension-ecrit': 60, ecriture: 40 },
  },
  'enia-college-maths': {
    label: 'Type ENIA collège · maths',
    hint: 'Collège : nombres, mesures, géométrie et données. Parts réglables.',
    shares: {
      'nombres-operations': 40,
      'grandeurs-mesures': 20,
      'geometrie-espace': 25,
      donnees: 15,
    },
  },
  libre: {
    label: 'Libre',
    hint: 'Vous choisissez les domaines et leurs parts.',
    shares: {},
  },
};

export const EXAM_MAX_QUESTIONS = 40;
export const EXAM_DEFAULT_THRESHOLD = 50;

const shares = z
  .partialRecord(z.enum(EXERCISE_DOMAINS), z.number().int().min(0).max(100))
  .refine(
    (s) => Object.values(s).some((v) => (v ?? 0) > 0),
    'Donnez une part à au moins un domaine.',
  )
  .refine(
    (s) => Object.values(s).reduce<number>((a, b) => a + (b ?? 0), 0) <= 100,
    'Le total des parts dépasse 100 %.',
  );

export const CreateExamSchema = z.object({
  organizationId: z.uuid(),
  curriculumVersionId: z.uuid({ message: 'Choisissez le programme.' }),
  model: z.enum(EXAM_MODELS),
  title: z.string().trim().min(1, 'Donnez un titre.').max(120),
  shares,
  questionCount: z.number().int().min(4, 'Quatre questions au moins.').max(EXAM_MAX_QUESTIONS),
  durationMinutes: z.number().int().min(5).max(240),
  threshold: z.number().int().min(1).max(100).default(EXAM_DEFAULT_THRESHOLD),
});
export type CreateExamInput = z.infer<typeof CreateExamSchema>;

export const UpdateExamSchema = z.object({
  title: z.string().trim().min(1, 'Donnez un titre.').max(120),
  durationMinutes: z.number().int().min(5).max(240),
  threshold: z.number().int().min(1).max(100),
});
export type UpdateExamInput = z.infer<typeof UpdateExamSchema>;

export const GiveExamSchema = z.object({
  cohortIds: z.array(z.uuid()).min(1, 'Choisissez au moins une classe.').max(20),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  /** Sur papier : les élèves ne la voient pas en ligne ; l'enseignant saisit les copies. */
  onPaper: z.boolean().default(false),
});
export type GiveExamInput = z.infer<typeof GiveExamSchema>;

export interface ExamSummary {
  id: string;
  title: string;
  model: ExamModel;
  organization: { id: string; name: string };
  curriculum: string;
  questionCount: number;
  itemCount: number;
  durationMinutes: number;
  threshold: number;
  author: string | null;
  classCount: number;
  submissionCount: number;
  createdAt: string;
}

export interface ExamPlanRow {
  domain: ExerciseDomain;
  share: number;
  target: number;
  chosen: number;
  available: number;
}

export interface ExamItem {
  exerciseId: string;
  position: number;
  title: string;
  kind: ExerciseKind;
  domain: ExerciseDomain;
  difficulty: ExerciseDifficulty;
  skill: ExerciseSkill;
  competencyCode: string;
}

export interface ExamGiven {
  assignmentId: string;
  cohortId: string;
  cohortName: string;
  dueAt: string | null;
  learnerCount: number;
  submissionCount: number;
  onPaper: boolean;
}

export interface ExamDetail extends ExamSummary {
  shares: Partial<Record<ExerciseDomain, number>>;
  plan: ExamPlanRow[];
  items: ExamItem[];
  given: ExamGiven[];
  /** Un élève l'a passée : les questions ne changent plus. */
  locked: boolean;
  canEdit: boolean;
}

export interface ExamRate {
  key: string;
  label: string;
  /** Part des points obtenus, de 0 à 100. */
  rate: number;
  count: number;
}

export interface ExamResults {
  exam: { id: string; title: string; threshold: number; questionCount: number };
  cohorts: Array<{ id: string; name: string }>;
  cohortId: string | null;
  expected: number;
  participants: number;
  aboveThreshold: number;
  /** Moyenne des élèves, de 0 à 100 (null sans copie). */
  average: number | null;
  byDomain: ExamRate[];
  bySkill: ExamRate[];
  byQuestion: Array<ExamRate & { position: number; domain: ExerciseDomain }>;
  /** Élèves sous le seuil, du plus bas au plus haut. */
  below: Array<{ learnerId: string; name: string; cohortName: string; rate: number }>;
}

/** Question du livret imprimé : l'énoncé tel que l'élève le voit, et la réponse attendue. */
export interface ExamBookletItem {
  exerciseId: string;
  position: number;
  title: string;
  domain: ExerciseDomain;
  play: ExercisePlay;
  /** Réponse attendue, en clair (pour le corrigé de l'enseignant). */
  answer: string;
}

export interface ExamBooklet {
  exam: { id: string; title: string; durationMinutes: number; organization: string };
  items: ExamBookletItem[];
}

/** Grille de saisie des copies papier d'une classe. */
export interface ExamPaperSheet {
  exam: { id: string; title: string };
  cohort: { id: string; name: string };
  assignmentId: string;
  onPaper: boolean;
  items: Array<{ exerciseId: string; position: number; title: string }>;
  rows: Array<{
    learnerId: string;
    name: string;
    /** 1 = juste, 0 = faux, pour chaque question ; null sans copie saisie. */
    marks: number[] | null;
    /** Copie faite en ligne : elle ne se modifie pas ici. */
    online: boolean;
  }>;
}

export const SaveExamPaperSchema = z.object({
  cohortId: z.uuid(),
  rows: z
    .array(
      z.object({
        learnerId: z.uuid(),
        /** null : pas de copie (absent) ; sinon 0 ou 1 par question. */
        marks: z
          .array(z.union([z.literal(0), z.literal(1)]))
          .max(EXAM_MAX_QUESTIONS)
          .nullable(),
      }),
    )
    .max(200),
});
export type SaveExamPaperInput = z.infer<typeof SaveExamPaperSchema>;
