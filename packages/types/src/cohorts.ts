import { z } from 'zod';
import { LEVEL_CODES, LEVEL_GROUPS, type LevelCode } from './levels.js';

/** Classes : création, enseignants et code de classe (configuration, étape 2). */

export const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/;

export const CreateCohortSchema = z.object({
  organizationId: z.uuid(),
  level: z.enum(LEVEL_CODES),
  name: z.string().trim().min(1, 'Donnez un nom à la classe.').max(60),
  schoolYear: z.string().regex(SCHOOL_YEAR_PATTERN, 'Année scolaire attendue : 2026-2027.'),
});

export const CohortTeacherSchema = z.object({ userId: z.uuid() });
export const JoinCohortSchema = z.object({ code: z.string().trim().min(4).max(20) });

/** Niveaux proposés selon le type d'établissement (un primaire propose CP1 à CM2, un lycée 2nde à Tle). */
export function levelsForOrganizationType(
  type: string,
): ReadonlyArray<{ code: LevelCode; title: string }> {
  const groups: Record<string, string[]> = {
    primary_public: ['maternelle', 'primaire'],
    primary_private: ['maternelle', 'primaire'],
    college: ['college'],
    lycee: ['lycee'],
    secondary_private: ['college', 'lycee'],
    literacy_center: ['alphabetisation'],
  };
  const wanted = groups[type];
  if (type === 'authority') return [];
  return LEVEL_GROUPS.filter((g) => !wanted || wanted.includes(g.code)).flatMap((g) =>
    g.levels.map((l) => ({ code: l.code, title: `${g.title} ${l.title}` })),
  );
}

export interface CohortAdminItem {
  id: string;
  name: string;
  level: string | null;
  levelLabel: string | null;
  schoolYear: string;
  archivedAt: string | null;
  /** Code que l'élève saisit pour rejoindre la classe ; absent tant qu'il n'a pas été créé. */
  joinCode: string | null;
  learnerCount: number;
  teachers: Array<{ userId: string; name: string }>;
}

export interface OrganizationCohorts {
  items: CohortAdminItem[];
  /** Enseignants de l'équipe de l'établissement, qu'on peut affecter à une classe. */
  teacherCandidates: Array<{ userId: string; name: string }>;
  levels: ReadonlyArray<{ code: LevelCode; title: string }>;
}
