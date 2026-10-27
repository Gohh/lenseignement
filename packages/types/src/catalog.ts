import { z } from 'zod';
import { BranchCodeSchema } from './branches.js';

/**
 * Catalogue public (cahier §3.2 « Visiteur », ticket 10) : seules les versions **publiées** après
 * double validation (ADR-006) y figurent. Aucune donnée personnelle n'y est exposée.
 */

export const CATALOG_PAGE_SIZE = 12;

export const CatalogQuerySchema = z.object({
  branch: BranchCodeSchema.optional(),
  q: z.string().trim().max(100).optional(),
  competency: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{1,32}$/, 'Code de compétence invalide.')
    .optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

export interface CatalogCourse {
  /** Identifiant du cours (stable d'une version publiée à la suivante). */
  id: string;
  versionNumber: number;
  title: string;
  summary: string;
  audience: string;
  language: string;
  estimatedMinutes: number | null;
  branch: string;
  organization: string;
  curriculum: { code: string; label: string } | null;
  competencies: Array<{ code: string; title: string }>;
  lessonCount: number;
  publishedAt: string;
}

export interface CatalogPage {
  items: CatalogCourse[];
  total: number;
  page: number;
  pageSize: number;
  /** Compétences visées par les cours publiés de l'espace choisi, pour le filtre. */
  competencies: Array<{ code: string; title: string }>;
}

export interface CatalogCourseDetail extends CatalogCourse {
  licence: string;
  modules: Array<{
    title: string;
    lessons: Array<{ title: string; estimatedMinutes: number | null }>;
  }>;
}

/**
 * Leçon d'un cours publié, repérée par son rang dans le cours (1, 2, 3…) : l'adresse reste
 * valable quand une nouvelle version du cours est publiée avec le même plan (ticket 11).
 */
export interface CatalogLesson {
  courseId: string;
  courseTitle: string;
  versionNumber: number;
  language: string;
  number: number;
  total: number;
  module: { number: number; title: string };
  title: string;
  body: string;
  estimatedMinutes: number | null;
  previous: number | null;
  next: number | null;
}
