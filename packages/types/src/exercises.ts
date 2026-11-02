import { z } from 'zod';

/**
 * Fabrique d'exercices (étape 2 du plan validé par GOHH le 02/11/2026). Chaque exercice est
 * attaché à une compétence d'un programme publié et rangé dans un domaine, comme dans les grandes
 * évaluations (PASEC, TIMSS, EGRA, EGMA, ENIA). Circuit : brouillon → relecture → publié → retiré.
 * Le corrigé reste sur le serveur : l'élève ne reçoit que la version « à jouer ».
 */

/** Domaines, par grande matière (repris des cadres PASEC, TIMSS et EGRA/EGMA). */
export const EXERCISE_DOMAINS = [
  'nombres-operations',
  'grandeurs-mesures',
  'geometrie-espace',
  'donnees',
  'comprehension-orale',
  'decodage',
  'comprehension-ecrit',
  'ecriture',
  'sciences',
  'autre',
] as const;
export type ExerciseDomain = (typeof EXERCISE_DOMAINS)[number];

export const EXERCISE_DOMAIN_LABELS: Record<ExerciseDomain, string> = {
  'nombres-operations': 'Nombres et opérations',
  'grandeurs-mesures': 'Grandeurs et mesures',
  'geometrie-espace': 'Géométrie et espace',
  donnees: 'Données (tableaux, graphiques)',
  'comprehension-orale': 'Compréhension orale',
  decodage: 'Lecture-décodage',
  'comprehension-ecrit': 'Compréhension de l’écrit',
  ecriture: 'Écriture et orthographe',
  sciences: 'Sciences',
  autre: 'Autre',
};

export const EXERCISE_DIFFICULTIES = ['facile', 'moyen', 'difficile'] as const;
export type ExerciseDifficulty = (typeof EXERCISE_DIFFICULTIES)[number];
export const EXERCISE_DIFFICULTY_LABELS: Record<ExerciseDifficulty, string> = {
  facile: 'Facile',
  moyen: 'Moyen',
  difficile: 'Difficile',
};

/** Ce que l'élève doit faire (domaines cognitifs de TIMSS). */
export const EXERCISE_SKILLS = ['connaitre', 'appliquer', 'raisonner'] as const;
export type ExerciseSkill = (typeof EXERCISE_SKILLS)[number];
export const EXERCISE_SKILL_LABELS: Record<ExerciseSkill, string> = {
  connaitre: 'Connaître',
  appliquer: 'Appliquer',
  raisonner: 'Raisonner',
};

export const EXERCISE_KINDS = [
  'choice',
  'truefalse',
  'gaps',
  'match',
  'order',
  'number',
  'table',
  'reading',
  'media',
] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export const EXERCISE_KIND_LABELS: Record<ExerciseKind, string> = {
  choice: 'Choix multiple',
  truefalse: 'Vrai ou faux',
  gaps: 'Texte à trous',
  match: 'Relier',
  order: 'Remettre dans l’ordre',
  number: 'Calcul à saisir',
  table: 'Tableau ou graphique',
  reading: 'Question sur un texte',
  media: 'Image ou son',
};

export const EXERCISE_KIND_HINTS: Record<ExerciseKind, string> = {
  choice: 'Une seule bonne réponse',
  truefalse: 'Une affirmation',
  gaps: 'Mots ou nombres',
  match: 'Deux colonnes',
  order: 'Étapes, nombres',
  number: 'Réponse en nombre',
  table: 'Lire des données',
  reading: 'Lecture',
  media: 'Écouter, regarder',
};

export const EXERCISE_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export type ExerciseStatus = (typeof EXERCISE_STATUSES)[number];
export const EXERCISE_STATUS_LABELS: Record<ExerciseStatus, string> = {
  draft: 'Brouillon',
  review: 'En relecture',
  published: 'Publié',
  archived: 'Retiré',
};

const text = (max: number) => z.string().trim().min(1, 'Champ à remplir.').max(max);
const note = (max: number) => z.string().trim().max(max).default('');
const choices = z
  .array(text(200))
  .min(2, 'Au moins deux réponses.')
  .max(6, 'Six réponses au plus.');
const choiceQuestion = z
  .object({ prompt: text(400), choices, correct: z.number().int().min(0) })
  .refine((q) => q.correct < q.choices.length, 'Choisissez la bonne réponse.');

/** Trous écrits [[réponse]] ; plusieurs réponses acceptées séparées par « | ». */
export const GAP = /\[\[([^\]]+)\]\]/g;

/** Fichier (image ou son) déjà déposé, repéré par sa clé. */
export const ExerciseMediaSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{32}$/),
  type: z.enum(['image', 'audio']),
  /** Description de l'image, lue aux élèves qui ne la voient pas. */
  alt: note(200),
});
export type ExerciseMedia = z.infer<typeof ExerciseMediaSchema>;

const common = {
  /** Consigne ou énoncé. */
  prompt: text(1000),
  /** Explication montrée après la réponse. */
  explanation: note(600),
  media: ExerciseMediaSchema.nullable().default(null),
};

/** Contenu d'un exercice avec son corrigé (jamais envoyé à l'élève). */
export const ExerciseContentSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('choice'), ...common, choices, correct: z.number().int().min(0) })
    .refine((c) => c.correct < c.choices.length, 'Choisissez la bonne réponse.'),
  z.object({ kind: z.literal('truefalse'), ...common, correct: z.boolean() }),
  z
    .object({ kind: z.literal('gaps'), ...common, text: text(1500) })
    .refine((c) => [...c.text.matchAll(GAP)].length > 0, 'Écrivez au moins un trou : [[réponse]].')
    .refine((c) => [...c.text.matchAll(GAP)].length <= 12, 'Douze trous au plus.'),
  z.object({
    kind: z.literal('match'),
    ...common,
    pairs: z
      .array(z.object({ left: text(160), right: text(160) }))
      .min(2, 'Au moins deux paires.')
      .max(8, 'Huit paires au plus.'),
  }),
  z.object({
    kind: z.literal('order'),
    ...common,
    /** Dans le BON ordre ; l'élève les voit mélangés. */
    items: z.array(text(200)).min(2, 'Au moins deux éléments.').max(8, 'Huit éléments au plus.'),
  }),
  z.object({
    kind: z.literal('number'),
    ...common,
    answer: z.number().finite(),
    /** Écart accepté (0 : la valeur exacte). */
    tolerance: z.number().min(0).default(0),
    unit: note(40),
  }),
  z
    .object({
      kind: z.literal('table'),
      ...common,
      table: z.object({
        header: z.array(note(80)).min(1).max(8),
        rows: z
          .array(z.array(note(80)).max(8))
          .min(1, 'Au moins une ligne.')
          .max(15),
      }),
      choices,
      correct: z.number().int().min(0),
    })
    .refine((c) => c.correct < c.choices.length, 'Choisissez la bonne réponse.'),
  z.object({
    kind: z.literal('reading'),
    ...common,
    passage: text(5000),
    questions: z.array(choiceQuestion).min(1, 'Au moins une question.').max(6),
  }),
  z
    .object({ kind: z.literal('media'), ...common, choices, correct: z.number().int().min(0) })
    .refine((c) => c.correct < c.choices.length, 'Choisissez la bonne réponse.')
    .refine((c) => c.media !== null, 'Ajoutez l’image ou le son.'),
]);
export type ExerciseContent = z.infer<typeof ExerciseContentSchema>;

export const CreateExerciseSchema = z.object({
  organizationId: z.uuid(),
  competencyId: z.uuid({ message: 'Choisissez la compétence.' }),
  domain: z.enum(EXERCISE_DOMAINS),
  difficulty: z.enum(EXERCISE_DIFFICULTIES),
  skill: z.enum(EXERCISE_SKILLS),
  kind: z.enum(EXERCISE_KINDS),
  title: text(120),
});
export type CreateExerciseInput = z.infer<typeof CreateExerciseSchema>;

export const UpdateExerciseSchema = z.object({
  title: text(120),
  competencyId: z.uuid({ message: 'Choisissez la compétence.' }),
  domain: z.enum(EXERCISE_DOMAINS),
  difficulty: z.enum(EXERCISE_DIFFICULTIES),
  skill: z.enum(EXERCISE_SKILLS),
  content: ExerciseContentSchema,
});
export type UpdateExerciseInput = z.infer<typeof UpdateExerciseSchema>;

/**
 * Exercice prêt à importer (fichier préparé à l'avance, ou proposé par l'IA) : la compétence est
 * donnée par son code dans le programme choisi. Pas d'image ni de son : on les ajoute ensuite.
 */
export const ExerciseImportItemSchema = z.object({
  competencyCode: z.string().trim().min(1, 'Code de compétence manquant.').max(40),
  domain: z.enum(EXERCISE_DOMAINS),
  difficulty: z.enum(EXERCISE_DIFFICULTIES).default('moyen'),
  skill: z.enum(EXERCISE_SKILLS).default('appliquer'),
  title: text(120),
  content: ExerciseContentSchema,
});
export type ExerciseImportItem = z.infer<typeof ExerciseImportItemSchema>;

/** Nombre maximal d'exercices dans un fichier d'import. */
export const EXERCISE_IMPORT_MAX = 200;

export const ExerciseImportSchema = z.object({
  organizationId: z.uuid(),
  /** Version publiée du programme dont les codes de compétence sont tirés. */
  curriculumVersionId: z.uuid({ message: 'Choisissez le programme.' }),
  items: z
    .array(z.unknown())
    .min(1, 'Le fichier ne contient aucun exercice.')
    .max(EXERCISE_IMPORT_MAX),
});

export interface ExerciseImportResult {
  created: number;
  /** Exercices refusés, avec leur numéro dans le fichier (à partir de 1). */
  errors: Array<{ index: number; title: string; message: string }>;
}

export const ExerciseReturnSchema = z.object({ note: text(600) });

/** Réponse de l'élève : numéros choisis, ou textes saisis (trous, calcul). */
export const ExerciseAnswerSchema = z.object({
  choices: z.array(z.number().int().min(-1).max(20)).max(20).default([]),
  texts: z.array(z.string().max(200)).max(20).default([]),
});
export type ExerciseAnswer = z.infer<typeof ExerciseAnswerSchema>;

/** Exercice tel que l'élève le voit : sans corrigé, ordre mélangé quand il le faut. */
export type ExercisePlay = { kind: ExerciseKind; prompt: string; media: ExerciseMedia | null } & (
  | { kind: 'choice' | 'media'; choices: string[] }
  | { kind: 'truefalse' }
  | { kind: 'gaps'; parts: string[] }
  | { kind: 'match'; lefts: string[]; rights: string[] }
  | { kind: 'order'; items: string[] }
  | { kind: 'number'; unit: string }
  | { kind: 'table'; table: { header: string[]; rows: string[][] }; choices: string[] }
  | { kind: 'reading'; passage: string; questions: Array<{ prompt: string; choices: string[] }> }
);

export interface ExerciseResult {
  correct: boolean;
  /** Part des points obtenus, de 0 à 1. */
  score: number;
  feedback: string[];
}

/**
 * Ordre d'affichage mélangé, toujours le même pour un même nombre d'éléments, et jamais l'ordre
 * de départ (sinon la bonne réponse se lirait directement).
 */
export function exerciseShuffle(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return order;
  let seed = 7 + n * 31;
  for (let i = n - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

export function exercisePlay(content: ExerciseContent): ExercisePlay {
  const base = { prompt: content.prompt, media: content.media };
  switch (content.kind) {
    case 'choice':
    case 'media':
      return { ...base, kind: content.kind, choices: content.choices };
    case 'truefalse':
      return { ...base, kind: 'truefalse' };
    case 'gaps':
      return {
        ...base,
        kind: 'gaps',
        parts: content.text.split(GAP).filter((_, i) => i % 2 === 0),
      };
    case 'match':
      return {
        ...base,
        kind: 'match',
        lefts: content.pairs.map((p) => p.left),
        rights: exerciseShuffle(content.pairs.length).map((i) => content.pairs[i]!.right),
      };
    case 'order':
      return {
        ...base,
        kind: 'order',
        items: exerciseShuffle(content.items.length).map((i) => content.items[i]!),
      };
    case 'number':
      return { ...base, kind: 'number', unit: content.unit };
    case 'table':
      return { ...base, kind: 'table', table: content.table, choices: content.choices };
    case 'reading':
      return {
        ...base,
        kind: 'reading',
        passage: content.passage,
        questions: content.questions.map((q) => ({ prompt: q.prompt, choices: q.choices })),
      };
  }
}

/** Texte comparé sans tenir compte des majuscules, accents, espaces en trop ni ponctuation finale. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?;:]+$/u, '')
    .trim();
}

/** Nombre écrit à la française ou non : « 1 250,5 », « 1250.5 ». */
export function parseNumber(value: string): number | null {
  const clean = value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

function ratio(good: number, total: number): ExerciseResult['score'] {
  return total === 0 ? 0 : Math.round((good / total) * 100) / 100;
}

/** Corrige une réponse. Le message ne donne jamais la bonne réponse avant l'explication. */
export function gradeExercise(content: ExerciseContent, answer: ExerciseAnswer): ExerciseResult {
  const feedback: string[] = [];
  let good = 0;
  let total = 1;
  switch (content.kind) {
    case 'choice':
    case 'media':
    case 'table':
      good = answer.choices[0] === content.correct ? 1 : 0;
      break;
    case 'truefalse':
      // 0 : vrai, 1 : faux.
      good = answer.choices[0] === (content.correct ? 0 : 1) ? 1 : 0;
      break;
    case 'gaps': {
      const expected = [...content.text.matchAll(GAP)].map((m) =>
        m[1]!.split('|').map(normalizeAnswer),
      );
      total = expected.length;
      expected.forEach((accepted, i) => {
        const given = normalizeAnswer(answer.texts[i] ?? '');
        if (given && accepted.includes(given)) good += 1;
        else feedback.push(`Trou n° ${i + 1} : à revoir.`);
      });
      break;
    }
    case 'match': {
      const display = exerciseShuffle(content.pairs.length);
      total = content.pairs.length;
      content.pairs.forEach((pair, i) => {
        const picked = answer.choices[i];
        if (picked !== undefined && display[picked] === i) good += 1;
        else feedback.push(`« ${pair.left} » : à revoir.`);
      });
      break;
    }
    case 'order': {
      const display = exerciseShuffle(content.items.length);
      total = content.items.length;
      const chosen = answer.choices.map((d) => display[d]);
      content.items.forEach((_, place) => {
        if (chosen[place] === place) good += 1;
      });
      if (good < total) feedback.push('L’ordre n’est pas encore le bon.');
      break;
    }
    case 'number': {
      const value = parseNumber(answer.texts[0] ?? '');
      if (value === null) feedback.push('Écris un nombre.');
      else if (Math.abs(value - content.answer) <= content.tolerance + 1e-9) good = 1;
      break;
    }
    case 'reading':
      total = content.questions.length;
      content.questions.forEach((q, i) => {
        if (answer.choices[i] === q.correct) good += 1;
        else feedback.push(`Question ${i + 1} : à revoir.`);
      });
      break;
  }
  const correct = good === total;
  if (content.explanation) feedback.push(content.explanation);
  return { correct, score: ratio(good, total), feedback };
}

export interface ExerciseSummary {
  id: string;
  title: string;
  kind: ExerciseKind;
  domain: ExerciseDomain;
  difficulty: ExerciseDifficulty;
  skill: ExerciseSkill;
  status: ExerciseStatus;
  competency: { id: string; code: string; title: string; subject: string; curriculum: string };
  organization: { id: string; name: string };
  author: string | null;
  reviewer: string | null;
  reviewNote: string | null;
  updatedAt: string;
  /** De l'une des structures de la personne (sinon : vu dans la banque commune). */
  mine: boolean;
  canPublish: boolean;
}

export interface ExerciseDetail extends ExerciseSummary {
  content: ExerciseContent;
  play: ExercisePlay;
  canEdit: boolean;
  /** Brouillon qui remplacera cet exercice publié, s'il existe. */
  draftId: string | null;
}

export interface ExerciseCompetencyOption {
  id: string;
  code: string;
  title: string;
  subject: string;
  level: string | null;
  curriculum: string;
  curriculumId: string;
}

/** Poids maximal d'une image ou d'un son d'exercice. */
export const EXERCISE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
