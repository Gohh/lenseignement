import { z } from 'zod';
import { BranchCodeSchema } from './branches.js';

/**
 * Format d'un fichier de programme (référentiel) importable : une version complète d'un
 * programme, avec ses niveaux, matières, compétences et prérequis (cahier directeur §6.2).
 * Les codes de compétence sont stables d'une version à l'autre : c'est ce qui permet de suivre
 * une compétence à travers les réformes.
 */

const Code = z
  .string()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{0,39}$/,
    'Code attendu : majuscules, chiffres, « . », « _ » ou « - ».',
  );

export const PolicySourceSchema = z.object({
  title: z.string().min(1),
  issuer: z.string().min(1),
  url: z.string().url().optional(),
  publishedOn: z.iso.date().optional(),
  /** Vrai seulement pour un texte officiel dont la réutilisation est autorisée et validée. */
  isOfficial: z.boolean(),
});
export type PolicySource = z.infer<typeof PolicySourceSchema>;

export const CurriculumFileSchema = z
  .object({
    curriculum: z.object({
      code: Code,
      branch: BranchCodeSchema,
      title: z.string().min(1),
      description: z.string().min(1),
    }),
    version: z.object({
      label: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/),
      notes: z.string().optional(),
      source: PolicySourceSchema,
    }),
    levels: z.array(z.object({ code: Code, title: z.string().min(1) })).min(1),
    subjects: z.array(z.object({ code: Code, title: z.string().min(1) })).min(1),
    competencies: z
      .array(
        z.object({
          code: Code,
          title: z.string().min(1),
          description: z.string().optional(),
          subject: Code,
          level: Code.optional(),
          prerequisites: z.array(Code).default([]),
        }),
      )
      .min(1),
  })
  .superRefine((file, ctx) => {
    const duplicates = (codes: string[]) => codes.filter((c, i) => codes.indexOf(c) !== i);
    for (const key of ['levels', 'subjects', 'competencies'] as const) {
      for (const code of duplicates(file[key].map((item) => item.code))) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Code en double : ${code}` });
      }
    }
    const levels = new Set(file.levels.map((l) => l.code));
    const subjects = new Set(file.subjects.map((s) => s.code));
    const competencies = new Set(file.competencies.map((c) => c.code));
    file.competencies.forEach((c, i) => {
      if (!subjects.has(c.subject)) {
        ctx.addIssue({
          code: 'custom',
          path: ['competencies', i, 'subject'],
          message: `Matière inconnue : ${c.subject}`,
        });
      }
      if (c.level && !levels.has(c.level)) {
        ctx.addIssue({
          code: 'custom',
          path: ['competencies', i, 'level'],
          message: `Niveau inconnu : ${c.level}`,
        });
      }
      for (const p of c.prerequisites) {
        if (!competencies.has(p)) {
          ctx.addIssue({
            code: 'custom',
            path: ['competencies', i, 'prerequisites'],
            message: `Prérequis inconnu : ${p}`,
          });
        }
      }
    });
    const cycle = findPrerequisiteCycle(file.competencies);
    if (cycle) {
      ctx.addIssue({
        code: 'custom',
        path: ['competencies'],
        message: `Prérequis en boucle : ${cycle.join(' → ')}`,
      });
    }
  });
export type CurriculumFile = z.infer<typeof CurriculumFileSchema>;

/** Renvoie une boucle de prérequis (A → B → A) si elle existe, sinon null. */
export function findPrerequisiteCycle(
  competencies: ReadonlyArray<{ code: string; prerequisites: readonly string[] }>,
): string[] | null {
  const prerequisitesOf = new Map(competencies.map((c) => [c.code, c.prerequisites]));
  const state = new Map<string, 'visiting' | 'done'>();
  const path: string[] = [];

  const visit = (code: string): string[] | null => {
    if (state.get(code) === 'done') return null;
    if (state.get(code) === 'visiting') return [...path.slice(path.indexOf(code)), code];
    state.set(code, 'visiting');
    path.push(code);
    for (const p of prerequisitesOf.get(code) ?? []) {
      const cycle = visit(p);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(code, 'done');
    return null;
  };

  for (const { code } of competencies) {
    const cycle = visit(code);
    if (cycle) return cycle;
  }
  return null;
}

/** Réponses publiques de l'API des programmes. Les brouillons ne sont jamais exposés. */
export interface CurriculumVersionSummary {
  label: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  source: PolicySource;
}

export interface CurriculumSummary {
  code: string;
  branch: string;
  title: string;
  description: string;
  current: CurriculumVersionSummary | null;
}

export interface CurriculumCompetency {
  code: string;
  title: string;
  description: string | null;
  subject: string;
  level: string | null;
  prerequisites: string[];
}

export interface CurriculumDetail extends Omit<CurriculumSummary, 'current'> {
  version: CurriculumVersionSummary;
  levels: Array<{ code: string; title: string }>;
  subjects: Array<{ code: string; title: string }>;
  competencies: CurriculumCompetency[];
}
