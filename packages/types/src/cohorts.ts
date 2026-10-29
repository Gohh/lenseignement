import { z } from 'zod';
import { LEVEL_CODES, LEVEL_GROUPS, type LevelCode } from './levels.js';

/** Classes : création, enseignants et code de classe (configuration, étape 2). */

export const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/;

/** Année scolaire d'une date : de septembre à août (« 2026-2027 » à partir de septembre 2026). */
export function schoolYearOf(date: Date): string {
  const start = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/** Années proposées à la création d'une classe : la précédente, l'année en cours et la suivante. */
export function schoolYearChoices(date: Date): string[] {
  const start = Number(schoolYearOf(date).slice(0, 4));
  return [start - 1, start, start + 1].map((y) => `${y}-${y + 1}`);
}

const isConsecutive = (year: string) => Number(year.slice(5)) === Number(year.slice(0, 4)) + 1;

export const CreateCohortSchema = z.object({
  organizationId: z.uuid(),
  level: z.enum(LEVEL_CODES),
  name: z.string().trim().min(1, 'Donnez un nom à la classe.').max(60),
  schoolYear: z
    .string()
    .regex(SCHOOL_YEAR_PATTERN, 'Année scolaire attendue : 2026-2027.')
    .refine(isConsecutive, 'Année scolaire attendue : deux années qui se suivent, 2026-2027.'),
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

export const TransferLearnersSchema = z.object({
  toCohortId: z.uuid(),
  /** Élèves à faire passer ; absent = toute la classe. */
  learnerIds: z.array(z.uuid()).max(500).optional(),
});

/** Ce que la direction peut faire sur une classe : retirer des élèves ou les faire passer ailleurs. */
export interface CohortRosterTools {
  /** Autres classes ouvertes du même établissement, où on peut faire passer des élèves. */
  targets: Array<{ id: string; name: string; schoolYear: string; levelLabel: string | null }>;
}
