import { z } from 'zod';

/** Écran « Consulter » du superadministrateur et de l'administrateur : lecture seule. */
export const CONSULT_VIEWS = ['cours', 'classes', 'devoirs', 'evaluations'] as const;
export type ConsultView = (typeof CONSULT_VIEWS)[number];

export const ConsultQuerySchema = z.object({
  /** Recherche dans le titre, la classe ou l'établissement. */
  search: z.string().trim().max(100).optional(),
});
export type ConsultQuery = z.infer<typeof ConsultQuerySchema>;

export type ConsultCourse = {
  id: string;
  title: string;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived';
  establishment: string;
  author: string | null;
  updatedAt: string;
};

export type ConsultClass = {
  id: string;
  name: string;
  level: string | null;
  schoolYear: string;
  establishment: string;
  teachers: string[];
  learners: number;
  archived: boolean;
};

export type ConsultAssignment = {
  id: string;
  title: string;
  className: string;
  establishment: string;
  author: string | null;
  dueAt: string | null;
  submitted: number;
  graded: number;
};

export type ConsultEvaluation = {
  id: string;
  title: string;
  subject: string | null;
  className: string;
  establishment: string;
  heldOn: string;
  maxScore: number;
  scored: number;
  /** Moyenne des notes saisies, sur `maxScore` ; null sans note. */
  average: number | null;
};

/** Au plus `CONSULT_LIMIT` lignes, les plus récentes d'abord. */
export const CONSULT_LIMIT = 200;
