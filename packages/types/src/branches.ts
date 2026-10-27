import { z } from 'zod';

/** Branches métier de la plateforme (cahier directeur §3). */
export const BRANCH_CODES = [
  'primaire',
  'secondaire',
  'technique',
  'alphabetisation',
  'formation-enseignants',
] as const;

export const BranchCodeSchema = z.enum(BRANCH_CODES);
export type BranchCode = z.infer<typeof BranchCodeSchema>;

export const BranchSchema = z.object({
  code: BranchCodeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  audience: z.string().min(1),
});
export type Branch = z.infer<typeof BranchSchema>;

export const BRANCHES: readonly Branch[] = [
  {
    code: 'primaire',
    title: 'Préscolaire et primaire',
    summary: 'Lecture, calcul et remédiation par activités courtes.',
    audience: 'Élèves, enseignants et familles',
  },
  {
    code: 'secondaire',
    title: 'Secondaire général',
    summary: 'Cours par discipline, sciences interactives et révisions.',
    audience: 'Élèves et enseignants',
  },
  {
    code: 'technique',
    title: 'Enseignement technique',
    summary: 'Filières, ateliers, sécurité et compétences métier.',
    audience: 'Apprenants, formateurs et entreprises',
  },
  {
    code: 'alphabetisation',
    title: 'Alphabétisation',
    summary: 'Lire, écrire et compter au quotidien, d’abord à l’écoute.',
    audience: 'Adultes et jeunes hors système',
  },
  {
    code: 'formation-enseignants',
    title: 'Formation des enseignants',
    summary: 'Parcours tutorés, observations de classe et ressources.',
    audience: 'Enseignants, formateurs et alphabétiseurs',
  },
];
