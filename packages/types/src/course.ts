import { z } from 'zod';
import { BranchCodeSchema } from './branches.js';

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

export const LessonInputSchema = z.object({
  title: Title,
  body: Text(20_000).default(''),
  estimatedMinutes: z.number().int().min(1).max(600).nullable().default(null),
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
  curriculum: {
    code: string;
    label: string;
    competencies: Array<{ code: string; title: string }>;
  } | null;
  modules: Array<{
    title: string;
    lessons: Array<{ title: string; body: string; estimatedMinutes: number | null }>;
  }>;
}

/** Établissements où la personne peut rédiger des cours. */
export interface AuthoringOrganization {
  id: string;
  name: string;
}
