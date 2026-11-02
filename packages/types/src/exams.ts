import { z } from 'zod';
import { LEVEL_CODES, type LevelCode } from './levels.js';
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

// Campagnes de zone (étape 4c) : une même épreuve passée par toutes les classes d'un niveau dans
// les écoles d'une zone, aux mêmes dates ; les notes restent cachées jusqu'à la clôture.

export const CreateCampaignSchema = z
  .object({
    examId: z.uuid({ message: 'Choisissez l’épreuve.' }),
    title: z.string().trim().min(1, 'Donnez un titre.').max(120),
    /** null : tout le pays. */
    zoneId: z.uuid().nullable(),
    level: z.enum(LEVEL_CODES, { message: 'Choisissez le niveau.' }),
    startsAt: z.iso.date({ message: 'Date de début invalide.' }),
    endsAt: z.iso.date({ message: 'Date de fin invalide.' }),
  })
  .refine((c) => c.endsAt > c.startsAt, {
    message: 'La fin doit venir après le début.',
    path: ['endsAt'],
  });
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const CampaignModeSchema = z.object({ onPaper: z.boolean() });

export type CampaignStatus = 'a-venir' | 'en-cours' | 'close';

export interface CampaignZone {
  /** null : tout le pays. */
  id: string | null;
  name: string;
  kind: 'pays' | 'drena' | 'iepp';
}

export interface CampaignOptions {
  zones: CampaignZone[];
  exams: Array<{ id: string; title: string; itemCount: number; organization: string }>;
}

export interface CampaignPreview {
  schools: number;
  classes: number;
  learners: number;
}

export interface CampaignSummary {
  id: string;
  title: string;
  exam: { id: string; title: string; questionCount: number; threshold: number };
  zone: CampaignZone;
  level: LevelCode;
  startsAt: string;
  endsAt: string;
  status: CampaignStatus;
  classes: number;
  learners: number;
  submitted: number;
  createdBy: string | null;
}

export interface CampaignSchoolRow {
  id: string;
  name: string;
  group: string;
  classes: number;
  learners: number;
  submitted: number;
}

export interface CampaignClass {
  assignmentId: string;
  cohortId: string;
  cohortName: string;
  school: string;
  onPaper: boolean;
  learners: number;
  submitted: number;
}

export interface CampaignDetail extends CampaignSummary {
  /** Celui qui a lancé, ou qui pilote la zone : suit la participation, clôt, supprime. */
  canPilot: boolean;
  /** Regroupement du suivi : DRENA (pays), IEPP (DRENA) ; vide pour une IEPP. */
  groupLabel: string | null;
  groups: Array<{ name: string; schools: number; learners: number; submitted: number }>;
  schools: CampaignSchoolRow[];
  /** Classes de la personne (enseignant ou direction de l'école). */
  myClasses: CampaignClass[];
}

// Résultats d'une campagne close (étape 4c-2), dans le tableau de pilotage : aucun nom d'élève,
// et une moyenne n'est montrée que pour un groupe d'au moins 5 élèves.

export interface CampaignResultRow {
  id: string;
  name: string;
  /** DRENA ou IEPP de rattachement (vide au niveau des groupes). */
  group: string;
  expected: number;
  participants: number;
  /** Moyenne sur 100 ; null quand moins de 5 élèves ont composé. */
  average: number | null;
  /** Part des élèves au-dessus du seuil ; null sous 5 élèves. */
  above: number | null;
  /** Domaine le moins réussi ; null sous 5 élèves. */
  weakest: { label: string; rate: number } | null;
}

export interface CampaignResults {
  campaign: CampaignSummary;
  /** Ce que la personne voit : toute la campagne (pilote) ou sa partie (statistiques). */
  scope: 'campagne' | 'ma-zone';
  groupLabel: string | null;
  expected: number;
  participants: number;
  average: number | null;
  above: number | null;
  byDomain: ExamRate[];
  bySkill: ExamRate[];
  byQuestion: Array<ExamRate & { position: number; domain: ExerciseDomain }>;
  groups: CampaignResultRow[];
  schools: CampaignResultRow[];
}
