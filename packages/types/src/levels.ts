import { z } from 'zod';
import type { BranchCode } from './branches.js';

/**
 * Niveaux et classes (retour de GOHH, 28/10/2026) : chaque cours peut viser un niveau précis de
 * son espace. Les espaces technique et formation des enseignants n'ont pas de niveau.
 */
export const LEVEL_CODES = [
  'mat-1',
  'mat-2',
  'mat-3',
  'cp1',
  'cp2',
  'ce1',
  'ce2',
  'cm1',
  'cm2',
  '6e',
  '5e',
  '4e',
  '3e',
  '2nde',
  '1re',
  'tle',
  'alpha-1',
  'alpha-2',
  'alpha-3',
] as const;

export const LevelCodeSchema = z.enum(LEVEL_CODES);
export type LevelCode = z.infer<typeof LevelCodeSchema>;

export interface LevelGroup {
  code: 'maternelle' | 'primaire' | 'college' | 'lycee' | 'alphabetisation';
  title: string;
  branch: BranchCode;
  levels: ReadonlyArray<{ code: LevelCode; title: string }>;
}

export const LEVEL_GROUPS: readonly LevelGroup[] = [
  {
    code: 'maternelle',
    title: 'Maternelle',
    branch: 'primaire',
    levels: [
      { code: 'mat-1', title: '1re section' },
      { code: 'mat-2', title: '2e section' },
      { code: 'mat-3', title: '3e section' },
    ],
  },
  {
    code: 'primaire',
    title: 'Primaire',
    branch: 'primaire',
    levels: [
      { code: 'cp1', title: 'CP1' },
      { code: 'cp2', title: 'CP2' },
      { code: 'ce1', title: 'CE1' },
      { code: 'ce2', title: 'CE2' },
      { code: 'cm1', title: 'CM1' },
      { code: 'cm2', title: 'CM2' },
    ],
  },
  {
    code: 'college',
    title: 'Collège',
    branch: 'secondaire',
    levels: [
      { code: '6e', title: '6e' },
      { code: '5e', title: '5e' },
      { code: '4e', title: '4e' },
      { code: '3e', title: '3e' },
    ],
  },
  {
    code: 'lycee',
    title: 'Lycée',
    branch: 'secondaire',
    levels: [
      { code: '2nde', title: '2nde' },
      { code: '1re', title: '1re' },
      { code: 'tle', title: 'Terminale' },
    ],
  },
  {
    code: 'alphabetisation',
    title: 'Alphabétisation',
    branch: 'alphabetisation',
    levels: [
      { code: 'alpha-1', title: 'Niveau 1' },
      { code: 'alpha-2', title: 'Niveau 2' },
      { code: 'alpha-3', title: 'Niveau 3' },
    ],
  },
];

const BY_CODE = new Map(
  LEVEL_GROUPS.flatMap((group) => group.levels.map((level) => [level.code, { ...level, group }])),
);

/** Nom complet d'un niveau, lisible seul : « Maternelle 1re section », « Primaire CP1 »… */
export function levelLabel(code: string): string | null {
  const found = BY_CODE.get(code as LevelCode);
  return found ? `${found.group.title} ${found.title}` : null;
}

/** Espace auquel appartient un niveau. */
export function levelBranch(code: LevelCode): BranchCode {
  return BY_CODE.get(code)!.group.branch;
}
