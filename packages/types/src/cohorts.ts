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
    preschool: ['maternelle'],
    primary: ['maternelle', 'primaire'],
    college: ['college'],
    lycee: ['lycee'],
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
  /** Le réglage Keycloak permet-il de créer des comptes d'élèves ? */
  canCreateAccounts: boolean;
  /** Code parent de chaque élève de la classe et nombre de parents déjà reliés. */
  parents: Array<{ learnerId: string; code: string | null; linked: number }>;
}

export const NewLearnerSchema = z.object({
  firstName: z.string().trim().min(1, 'Le prénom manque.').max(60),
  lastName: z.string().trim().min(1, 'Le nom manque.').max(60),
});

export const AddLearnersSchema = z.object({
  learners: z
    .array(NewLearnerSchema)
    .min(1, 'Ajoutez au moins un élève.')
    .max(200, 'Pas plus de 200 élèves à la fois.'),
});

export type NewLearner = z.infer<typeof NewLearnerSchema>;

/** Compte d'élève créé par la direction : à imprimer, le mot de passe n'est montré qu'une fois. */
export interface CreatedLearner {
  displayName: string;
  username: string;
  temporaryPassword: string;
  /** À remettre au parent : il le saisit dans « Ma famille » pour suivre cet élève. */
  parentCode: string;
}

export interface AddLearnersResult {
  created: CreatedLearner[];
  failed: Array<{ displayName: string; reason: string }>;
}

const HEADER_FIRST = /^pr[ée]noms?$/i;
const HEADER_LAST = /^(nom|noms|nom de famille)$/i;

/**
 * Liste d'élèves collée ou lue dans un fichier CSV (Excel : « Enregistrer sous… CSV »).
 * Une ligne par élève, « Nom ; Prénom » comme dans un registre. Une ligne d'en-tête
 * « Prénom ; Nom » (dans n'importe quel ordre) est reconnue et fixe l'ordre des colonnes.
 */
export function parseLearnerList(text: string): { learners: NewLearner[]; errors: string[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const split = (line: string) =>
    line.split(/[;,\t]/).map((cell) =>
      cell
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .trim(),
    );
  let lastIndex = 0;
  let firstIndex = 1;
  const header = lines[0] ? split(lines[0]) : [];
  const hFirst = header.findIndex((c) => HEADER_FIRST.test(c));
  const hLast = header.findIndex((c) => HEADER_LAST.test(c));
  if (hFirst >= 0 && hLast >= 0) {
    firstIndex = hFirst;
    lastIndex = hLast;
    lines.shift();
  }
  const learners: NewLearner[] = [];
  const errors: string[] = [];
  lines.forEach((line, n) => {
    const cells = split(line);
    let lastName = cells[lastIndex] ?? '';
    let firstName = cells[firstIndex] ?? '';
    // Sans séparateur : « KONÉ Awa Marie » → nom = premier mot, prénoms = la suite.
    if (cells.length === 1) {
      const [head, ...rest] = line.split(/\s+/);
      lastName = head ?? '';
      firstName = rest.join(' ');
    }
    const parsed = NewLearnerSchema.safeParse({ firstName, lastName });
    if (parsed.success) learners.push(parsed.data);
    else errors.push(`Ligne ${n + 1} : « ${line} » n’a pas de nom et de prénom.`);
  });
  return { learners, errors };
}

/** Identifiant de connexion d'un élève sans e-mail : « awa.kone », sans accents ni espaces. */
export function learnerUsername(learner: NewLearner): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20);
  const first = clean(learner.firstName.split(/\s+/)[0] ?? '');
  return [first, clean(learner.lastName)].filter(Boolean).join('.') || 'eleve';
}
