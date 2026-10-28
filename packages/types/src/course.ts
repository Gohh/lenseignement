import { z } from 'zod';
import { BranchCodeSchema } from './branches.js';
import { LevelCodeSchema } from './levels.js';

/**
 * Rédaction des cours (cahier §6.2 « Catalogue », §7). Un cours a des versions numérotées ;
 * seule la version en brouillon est modifiable. Les états de relecture et de publication sont
 * déclarés ici mais pilotés par le circuit de validation (ticket 9).
 */

export const COURSE_VERSION_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'archived',
] as const;
export type CourseVersionStatus = (typeof COURSE_VERSION_STATUSES)[number];

const Title = z.string().trim().min(3, 'Titre trop court (3 caractères minimum).').max(160);
const Text = (max: number) => z.string().trim().max(max);

export const CreateCourseSchema = z.object({
  organizationId: z.uuid(),
  branch: BranchCodeSchema,
  title: Title,
  summary: Text(1000).default(''),
});
export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;

/** Modification des informations d'un brouillon. `revision` protège des écrasements. */
export const UpdateCourseVersionSchema = z.object({
  revision: z.number().int().positive(),
  title: Title.optional(),
  summary: Text(1000).optional(),
  audience: Text(200).optional(),
  language: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
    .optional(),
  licence: Text(120).min(1).optional(),
  estimatedMinutes: z.number().int().min(1).max(10_000).nullable().optional(),
  /** Niveau ou classe visé, dans l'espace du cours (null : tous niveaux). */
  level: LevelCodeSchema.nullable().optional(),
  /** Programme de référence : version exacte, et compétences visées dans cette version. */
  curriculum: z
    .object({
      code: z.string().min(1),
      label: z.string().min(1),
      competencyCodes: z.array(z.string().min(1)).max(50),
    })
    .nullable()
    .optional(),
});
export type UpdateCourseVersionInput = z.infer<typeof UpdateCourseVersionSchema>;

/**
 * Question de quiz formatif (ticket 13, ADR-010) : un énoncé, deux à quatre choix, une seule bonne
 * réponse et une explication montrée après la réponse. Figée avec la version du cours.
 */
export const QuizQuestionInputSchema = z
  .object({
    prompt: Text(500).min(1, 'Chaque question doit avoir un énoncé.'),
    choices: z
      .array(Text(200).min(1, 'Un choix de réponse est vide.'))
      .min(2, 'Chaque question doit avoir au moins deux choix.')
      .max(4, 'Quatre choix au maximum par question.'),
    correct: z.number().int().min(0),
    explanation: Text(1000).default(''),
  })
  .refine((q) => q.correct < q.choices.length, {
    message: 'La bonne réponse doit être l’un des choix.',
    path: ['correct'],
  });
export type QuizQuestionInput = z.infer<typeof QuizQuestionInputSchema>;

export const LessonInputSchema = z.object({
  title: Title,
  body: Text(20_000).default(''),
  estimatedMinutes: z.number().int().min(1).max(600).nullable().default(null),
  quiz: z.array(QuizQuestionInputSchema).max(10).default([]),
});

export const ModuleInputSchema = z.object({
  title: Title,
  lessons: z.array(LessonInputSchema).max(50).default([]),
});

/** Plan complet du brouillon (modules et leçons), remplacé d'un bloc à chaque enregistrement. */
export const CourseOutlineSchema = z.object({
  revision: z.number().int().positive(),
  modules: z.array(ModuleInputSchema).max(30),
});
export type CourseOutlineInput = z.infer<typeof CourseOutlineSchema>;

export interface CourseVersionSummary {
  id: string;
  number: number;
  status: CourseVersionStatus;
  title: string;
  revision: number;
  updatedAt: string;
}

export interface CourseSummary {
  id: string;
  branch: string;
  organization: { id: string; name: string };
  latest: CourseVersionSummary;
}

export interface CourseDetail extends Omit<CourseSummary, 'latest'> {
  versions: CourseVersionSummary[];
}

export interface CourseVersionDetail extends CourseVersionSummary {
  courseId: string;
  branch: string;
  organization: { id: string; name: string };
  summary: string;
  audience: string;
  language: string;
  licence: string;
  estimatedMinutes: number | null;
  level: string | null;
  curriculum: {
    code: string;
    label: string;
    competencies: Array<{ code: string; title: string }>;
  } | null;
  modules: Array<{
    title: string;
    lessons: Array<{
      title: string;
      body: string;
      estimatedMinutes: number | null;
      quiz: QuizQuestionInput[];
    }>;
  }>;
}

/** Établissements où la personne peut rédiger des cours. */
export interface AuthoringOrganization {
  id: string;
  name: string;
}

/**
 * Circuit de validation (ADR-006) : l'auteur soumet, un référent pédagogique approuve après trois
 * contrôles, puis une deuxième personne (référent ou chef d'établissement) publie.
 */
export const REVIEW_CHECKS = {
  pedagogy: 'Exactitude pédagogique et adéquation au programme vérifiées',
  accessibility: 'Accessibilité vérifiée (texte clair, alternatives, lisibilité)',
  rights: 'Droits d’utilisation et licence vérifiés',
} as const;
export type ReviewCheck = keyof typeof REVIEW_CHECKS;

const Comment = (min: number) =>
  z.string().trim().min(min, `Commentaire trop court (${min} caractères minimum).`).max(2000);

export const SubmitForReviewSchema = z.object({ revision: z.number().int().positive() });

export const ApproveSchema = z.object({
  checklist: z.object({
    pedagogy: z.literal(true, 'Les trois contrôles doivent être cochés.'),
    accessibility: z.literal(true, 'Les trois contrôles doivent être cochés.'),
    rights: z.literal(true, 'Les trois contrôles doivent être cochés.'),
  }),
  comment: Comment(0).default(''),
});
export type ApproveInput = z.infer<typeof ApproveSchema>;

/** Demande de modifications ou retrait : le motif est obligatoire. */
export const ReasonSchema = z.object({ comment: Comment(10) });

export type ReviewAction =
  'submitted' | 'changes_requested' | 'approved' | 'published' | 'replaced' | 'withdrawn';

export interface CourseWorkflow {
  history: Array<{ action: ReviewAction; actorName: string; comment: string; createdAt: string }>;
  /** Ce que la personne connectée peut faire maintenant sur cette version. */
  can: {
    submit: boolean;
    approve: boolean;
    requestChanges: boolean;
    publish: boolean;
    withdraw: boolean;
  };
  /** Ce qui manque avant l'envoi en relecture (vide si tout est prêt). */
  missing: string[];
}

export interface ReviewQueueItem {
  versionId: string;
  courseId: string;
  number: number;
  status: CourseVersionStatus;
  title: string;
  organization: { id: string; name: string };
  updatedAt: string;
}
