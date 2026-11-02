import { z } from 'zod';
import { LEVEL_CODES, type LevelCode } from './levels.js';

// Évaluations orales chronométrées (étape 5, à la manière d'EGRA et d'EGMA) : l'enseignant fait
// lire ou compter l'élève à voix haute, touche ce qui est faux ; la plateforme calcule le score
// par minute. Aucun enregistrement de la voix : seuls les cases touchées et les scores sont gardés.

export const ORAL_SUBJECTS = ['lecture', 'maths'] as const;
export type OralSubject = (typeof ORAL_SUBJECTS)[number];
export const ORAL_SUBJECT_LABELS: Record<OralSubject, string> = {
  lecture: 'Lecture',
  maths: 'Mathématiques',
};

export const ORAL_PART_KINDS = ['grille', 'texte', 'questions'] as const;
export type OralPartKind = (typeof ORAL_PART_KINDS)[number];
export const ORAL_PART_KIND_LABELS: Record<OralPartKind, string> = {
  grille: 'Grille chronométrée (lettres, mots, nombres…)',
  texte: 'Petit texte chronométré, puis questions',
  questions: 'Questions sans chronomètre',
};

/** Règle d'arrêt : tout faux sur les premiers éléments, la partie s'arrête et compte 0. */
export const ORAL_STOP_RULE = 10;
export const ORAL_MAX_ITEMS = 150;

/** Mots d'un texte, dans l'ordre où l'élève les lit (la ponctuation reste collée au mot). */
export function oralWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

const short = (max: number) => z.string().trim().min(1).max(max);
const QuestionSchema = z.object({ prompt: short(300), answer: z.string().trim().max(200) });

export const OralPartSchema = z
  .object({
    kind: z.enum(ORAL_PART_KINDS),
    title: short(80),
    /** Consigne lue à l'élève. */
    instruction: z.string().trim().max(600).default(''),
    /** Grille : les éléments, dans l'ordre (pour un texte, les mots viennent du texte). */
    items: z.array(short(40)).max(ORAL_MAX_ITEMS).default([]),
    /** Texte : le texte tel que l'élève le lit. */
    text: z.string().trim().max(3000).default(''),
    questions: z.array(QuestionSchema).max(20).default([]),
    /** Durée de la partie chronométrée, en secondes. */
    seconds: z.number().int().min(15).max(300).default(60),
    /** Partie qui sert au repère (un seule par épreuve). */
    reference: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.kind === 'texte' && oralWords(p.text).length < 5) {
      ctx.addIssue({
        code: 'custom',
        message: `« ${p.title} » : écrivez un texte d’au moins 5 mots.`,
        path: ['text'],
      });
    }
    if (p.kind === 'texte' && oralWords(p.text).length > ORAL_MAX_ITEMS) {
      ctx.addIssue({
        code: 'custom',
        message: `« ${p.title} » : le texte dépasse ${ORAL_MAX_ITEMS} mots.`,
        path: ['text'],
      });
    }
    if (p.kind === 'grille' && p.items.length < 5) {
      ctx.addIssue({
        code: 'custom',
        message: `« ${p.title} » : il faut au moins 5 éléments à lire.`,
        path: ['items'],
      });
    }
    if (p.kind === 'questions' && p.questions.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: `« ${p.title} » : il faut au moins une question.`,
        path: ['questions'],
      });
    }
  });
export type OralPart = z.infer<typeof OralPartSchema>;

export const SaveOralTestSchema = z.object({
  organizationId: z.uuid({ message: 'Choisissez la structure.' }),
  title: z.string().trim().min(1, 'Donnez un titre.').max(120),
  subject: z.enum(ORAL_SUBJECTS),
  level: z.enum(LEVEL_CODES, { message: 'Choisissez le niveau.' }),
  parts: z.array(OralPartSchema).min(1, 'Ajoutez au moins une partie.').max(8),
});
export type SaveOralTestInput = z.infer<typeof SaveOralTestSchema>;

export const ORAL_MODELS = ['lecture-debut', 'maths-debut', 'alpha'] as const;
export type OralModel = (typeof ORAL_MODELS)[number];
export const ORAL_MODEL_LABELS: Record<OralModel, string> = {
  'lecture-debut': 'Lecture, début du primaire (sons, mots, mots inventés, petit texte)',
  'maths-debut': 'Mathématiques, début du primaire (nombres, comparer, additions…)',
  alpha: 'Alphabétisation (lettres, mots du quotidien, petit texte)',
};

export const CreateOralTestSchema = SaveOralTestSchema.omit({ parts: true }).extend({
  /** Partir d'un modèle (exemples à remplacer) ; null : une partie vide. */
  model: z.enum(ORAL_MODELS).nullable().default(null),
});
export type CreateOralTestInput = z.infer<typeof CreateOralTestSchema>;

export type OralTestStatus = 'brouillon' | 'publiee';

export interface OralTestSummary {
  id: string;
  title: string;
  subject: OralSubject;
  level: LevelCode;
  status: OralTestStatus;
  organization: { id: string; name: string };
  author: string | null;
  partCount: number;
  /** Élèves déjà évalués avec cette épreuve. */
  resultCount: number;
  canEdit: boolean;
  canPublish: boolean;
}

export interface OralTestDetail extends OralTestSummary {
  parts: OralPart[];
}

/** Classe où la personne peut faire passer une épreuve orale. */
export interface OralClass {
  id: string;
  name: string;
  school: string;
  level: LevelCode | null;
  learners: number;
  /** Enseignant ou direction de l'école ; sinon visite (conseiller pédagogique, IEPP). */
  visit: boolean;
}

/** Classe et épreuve déjà passées : lien vers les résultats. */
export interface OralDone {
  testId: string;
  testTitle: string;
  cohortId: string;
  cohortName: string;
  school: string;
  evaluated: number;
  learners: number;
  lastAt: string;
}

/** Page « Évaluations orales ». */
export interface OralOverview {
  tests: OralTestSummary[];
  classes: OralClass[];
  done: OralDone[];
  /** Structures pour lesquelles la personne peut rédiger. */
  organizations: Array<{ id: string; name: string }>;
  superadmin: boolean;
}

/** Feuille de passation : l'épreuve et les élèves de la classe. */
export interface OralSheet {
  test: OralTestDetail;
  cohort: { id: string; name: string; school: string };
  learners: Array<{ id: string; name: string; done: boolean }>;
}

/** Ce que l'enseignant a noté pour une partie. */
export const OralPartAnswerSchema = z.object({
  /** Éléments faux (index dans la grille ou dans les mots du texte). */
  errors: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(ORAL_MAX_ITEMS - 1),
    )
    .max(ORAL_MAX_ITEMS)
    .default([]),
  /** Dernier élément lu (index) ; null : rien lu. */
  last: z
    .number()
    .int()
    .min(0)
    .max(ORAL_MAX_ITEMS - 1)
    .nullable()
    .default(null),
  /** Secondes utilisées (moins que la durée si l'élève a fini plus tôt). */
  seconds: z.number().int().min(0).max(600).default(0),
  /** Partie arrêtée (règle d'arrêt) ou non passée : compte 0. */
  stopped: z.boolean().default(false),
  /** Questions : 1 juste, 0 faux, null pas posée. */
  answers: z
    .array(z.union([z.literal(0), z.literal(1)]).nullable())
    .max(20)
    .default([]),
});
export type OralPartAnswer = z.infer<typeof OralPartAnswerSchema>;

export const SaveOralResultSchema = z.object({
  /** Identifiant de l'envoi : un renvoi (hors ligne) n'est compté qu'une fois. */
  operationId: z.uuid(),
  testId: z.uuid(),
  cohortId: z.uuid(),
  learnerId: z.uuid(),
  takenAt: z.iso.datetime({ offset: true }).optional(),
  parts: z.array(OralPartAnswerSchema).min(1).max(8),
});
export type SaveOralResultInput = z.infer<typeof SaveOralResultSchema>;

/** Évaluation orale passée sans connexion, envoyée au retour d'internet. */
export const OralResultEventSchema = SaveOralResultSchema.extend({
  type: z.literal('oral_result'),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});
export type OralResultEvent = z.infer<typeof OralResultEventSchema>;

/** Score d'une partie, calculé par la plateforme. */
export interface OralPartScore {
  /** Éléments justes (grille, texte) ou questions justes. */
  correct: number;
  total: number;
  /** Justes par minute (parties chronométrées) ; null pour les questions. */
  perMinute: number | null;
  /** Questions du texte justes (partie « texte »). */
  questionsCorrect: number | null;
  stopped: boolean;
}

/** Repère : score par minute à atteindre sur la partie de référence, et questions justes. */
export interface OralBenchmark {
  level: LevelCode;
  subject: OralSubject;
  perMinute: number;
  questions: number | null;
}

export const SaveOralBenchmarksSchema = z.object({
  items: z
    .array(
      z.object({
        level: z.enum(LEVEL_CODES),
        subject: z.enum(ORAL_SUBJECTS),
        perMinute: z.number().int().min(1).max(300).nullable(),
        questions: z.number().int().min(0).max(20).nullable(),
      }),
    )
    .max(LEVEL_CODES.length * ORAL_SUBJECTS.length),
});

export interface OralClassResults {
  test: OralTestDetail;
  cohort: { id: string; name: string; school: string; learners: number };
  benchmark: OralBenchmark | null;
  /** Index de la partie de référence (repère, médiane, répartition). */
  referencePart: number;
  evaluated: number;
  /** Médiane par minute de la partie de référence. */
  median: number | null;
  /** Part des élèves à zéro sur la partie de référence. */
  zeroRate: number | null;
  /** Part des élèves qui atteignent le repère. */
  benchmarkRate: number | null;
  /** Moyenne par partie (par minute, ou questions justes sur le total). */
  byPart: Array<{ title: string; kind: OralPartKind; average: number; unit: string; max: number }>;
  /** Répartition sur la partie de référence : zéro, débute, en progrès, repère atteint. */
  bands: Array<{ key: 'zero' | 'debut' | 'progres' | 'repere'; label: string; count: number }>;
  learners: Array<{
    id: string;
    name: string;
    takenAt: string | null;
    assessor: string | null;
    scores: OralPartScore[] | null;
    reached: boolean | null;
  }>;
}

/** Éléments lus dans une partie chronométrée : la grille, ou les mots du texte. */
export function oralItems(part: OralPart): string[] {
  return part.kind === 'texte' ? oralWords(part.text) : part.kind === 'grille' ? part.items : [];
}

/** Partie qui sert au repère : celle marquée, sinon la première chronométrée. */
export function oralReferencePart(parts: readonly OralPart[]): number {
  const marked = parts.findIndex((p) => p.reference);
  if (marked >= 0) return marked;
  const timed = parts.findIndex((p) => p.kind !== 'questions');
  return timed >= 0 ? timed : 0;
}

/**
 * Score d'une partie : justes = éléments lus jusqu'au dernier moins les erreurs ; par minute =
 * justes × 60 / secondes utilisées. Tout faux sur les 10 premiers : la partie s'arrête et compte 0.
 */
export function scoreOralPart(part: OralPart, answer: OralPartAnswer): OralPartScore {
  const asked = part.questions.length;
  const rightAnswers = answer.answers.slice(0, asked).filter((x) => x === 1).length;
  if (part.kind === 'questions') {
    return {
      correct: rightAnswers,
      total: asked,
      perMinute: null,
      questionsCorrect: null,
      stopped: false,
    };
  }
  const items = oralItems(part);
  const total = items.length;
  const errors = new Set(answer.errors.filter((i) => i < total));
  const first = Math.min(ORAL_STOP_RULE, total);
  const ruleStop =
    first > 0 && Array.from({ length: first }, (_, i) => i).every((i) => errors.has(i));
  const stopped = answer.stopped || ruleStop;
  const questionsCorrect = part.kind === 'texte' && asked > 0 ? (stopped ? 0 : rightAnswers) : null;
  if (stopped || answer.last === null) {
    return { correct: 0, total, perMinute: 0, questionsCorrect, stopped };
  }
  const last = Math.min(answer.last, total - 1);
  let wrong = 0;
  for (const i of errors) if (i <= last) wrong += 1;
  const correct = last + 1 - wrong;
  const seconds = answer.seconds > 0 ? Math.min(answer.seconds, part.seconds) : part.seconds;
  return {
    correct,
    total,
    perMinute: Math.round((correct * 60) / seconds),
    questionsCorrect,
    stopped: false,
  };
}
