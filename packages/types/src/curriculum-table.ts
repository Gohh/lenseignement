import { z } from 'zod';
import { BranchCodeSchema } from './branches.js';
import { parseCsv } from './csv.js';

/**
 * Import d'un programme depuis un tableau (Excel enregistré en CSV) : une ligne par compétence.
 * Les renseignements sur le programme et la version viennent du formulaire ; le tableau est
 * transformé en fichier de programme, validé ensuite comme un fichier JSON.
 */

export const CurriculumTableMetaSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/, 'Code du programme : majuscules, chiffres et « - ».'),
  branch: BranchCodeSchema,
  title: z.string().trim().min(3, 'Le titre du programme est trop court.').max(160),
  description: z.string().trim().min(3, 'Ajoutez une phrase de description.').max(500),
  label: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,32}$/, 'Version : par exemple 2026 (lettres, chiffres, « - »).'),
  sourceTitle: z.string().trim().min(1, 'Indiquez le texte de référence.').max(300),
  sourceIssuer: z.string().trim().min(1, 'Indiquez qui a publié ce texte.').max(200),
  isOfficial: z.boolean(),
});
export type CurriculumTableMeta = z.infer<typeof CurriculumTableMetaSchema>;

/** En-têtes reconnus (sans accents ni majuscules). */
const COLUMNS = {
  level: /^(niveau|classe)/,
  subject: /^(matiere|discipline)/,
  code: /^code/,
  title: /^(competence|intitule)/,
  description: /^(description|detail)/,
  prerequisites: /^pre-?requis/,
} as const;

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** « Mathématiques » → « MATHEMATIQUES », « CP 1 » → « CP-1 ». */
export function codeFromTitle(title: string): string {
  const code = plain(title)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return code || 'X';
}

function uniqueCode(base: string, taken: Set<string>): string {
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base.slice(0, 36)}-${n}`;
  taken.add(code);
  return code;
}

/**
 * Transforme le tableau en fichier de programme. Les niveaux et matières prennent l'ordre
 * d'apparition ; un code de compétence vide est fabriqué (« MATHEMATIQUES-01 ») ; un prérequis
 * peut être écrit par son code ou par l'intitulé de la compétence.
 */
export function curriculumFromTable(
  csv: string,
  meta: CurriculumTableMeta,
): { file: unknown; errors: string[] } {
  const rows = parseCsv(csv).map((r) => r.map((c) => c.trim()));
  const header = (rows.shift() ?? []).map(plain);
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, re]) => [key, header.findIndex((h) => re.test(h))]),
  ) as Record<keyof typeof COLUMNS, number>;
  if (index.subject < 0 || index.title < 0) {
    return {
      file: null,
      errors: [
        'La première ligne doit donner les titres des colonnes : Niveau ; Matière ; Code ; Compétence ; Description ; Prérequis. Partez du modèle.',
      ],
    };
  }
  if (rows.length === 0)
    return { file: null, errors: ['Le tableau ne contient aucune compétence.'] };

  const cell = (row: string[], key: keyof typeof COLUMNS) =>
    index[key] >= 0 ? (row[index[key]] ?? '').trim() : '';
  const errors: string[] = [];
  const levels = new Map<string, { code: string; title: string }>();
  const subjects = new Map<string, { code: string; title: string }>();
  const levelCodes = new Set<string>();
  const subjectCodes = new Set<string>();
  const competencyCodes = new Set<string>();
  const perSubject = new Map<string, number>();
  const competencies: Array<{
    code: string;
    title: string;
    description?: string;
    subject: string;
    level?: string;
    prerequisites: string[];
  }> = [];
  const rawPrerequisites = new Map<string, string>();

  rows.forEach((row, i) => {
    const line = i + 2;
    const title = cell(row, 'title');
    const subjectTitle = cell(row, 'subject');
    if (!title || !subjectTitle) {
      errors.push(`Ligne ${line} : il manque ${!title ? 'la compétence' : 'la matière'}.`);
      return;
    }
    const levelTitle = cell(row, 'level');
    if (levelTitle && !levels.has(plain(levelTitle))) {
      levels.set(plain(levelTitle), {
        code: uniqueCode(codeFromTitle(levelTitle), levelCodes),
        title: levelTitle,
      });
    }
    if (!subjects.has(plain(subjectTitle))) {
      subjects.set(plain(subjectTitle), {
        code: uniqueCode(codeFromTitle(subjectTitle), subjectCodes),
        title: subjectTitle,
      });
    }
    const subject = subjects.get(plain(subjectTitle))!;
    const n = (perSubject.get(subject.code) ?? 0) + 1;
    perSubject.set(subject.code, n);
    const given = cell(row, 'code').toUpperCase().replace(/\s+/g, '-');
    if (given && competencyCodes.has(given)) {
      errors.push(`Ligne ${line} : le code ${given} est déjà pris par une autre compétence.`);
      return;
    }
    const code = given
      ? (competencyCodes.add(given), given)
      : uniqueCode(`${subject.code.slice(0, 30)}-${String(n).padStart(2, '0')}`, competencyCodes);
    const description = cell(row, 'description');
    competencies.push({
      code,
      title,
      ...(description ? { description } : {}),
      subject: subject.code,
      ...(levelTitle ? { level: levels.get(plain(levelTitle))!.code } : {}),
      prerequisites: [],
    });
    rawPrerequisites.set(code, cell(row, 'prerequisites'));
  });

  if (levels.size === 0) {
    errors.push('Indiquez le niveau (colonne Niveau) d’au moins une compétence.');
  }

  // Prérequis : par code, sinon par intitulé exact (sans accents ni majuscules).
  const byTitle = new Map(competencies.map((c) => [plain(c.title), c.code]));
  const separator = /[|/\n]|,(?=\s*\S)/;
  for (const c of competencies) {
    c.prerequisites = (rawPrerequisites.get(c.code) ?? '')
      .split(separator)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const asCode = p.toUpperCase().replace(/\s+/g, '-');
        return competencyCodes.has(asCode) ? asCode : (byTitle.get(plain(p)) ?? asCode);
      });
  }

  return {
    file: {
      curriculum: {
        code: meta.code,
        branch: meta.branch,
        title: meta.title,
        description: meta.description,
      },
      version: {
        label: meta.label,
        source: { title: meta.sourceTitle, issuer: meta.sourceIssuer, isOfficial: meta.isOfficial },
      },
      levels: [...levels.values()],
      subjects: [...subjects.values()],
      competencies,
    },
    errors,
  };
}
