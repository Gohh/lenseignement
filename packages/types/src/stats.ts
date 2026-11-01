/**
 * Tableau de chiffres anonymes (cahier §1 « analyses agrégées avec seuils de confidentialité »,
 * ticket 20, ADR-016). Aucun nom, aucun identifiant de personne : seulement des effectifs.
 */

/** Seuil de confidentialité : un effectif de 1 à 4 personnes n'est jamais affiché. */
export const STATS_THRESHOLD = 5;

/** Effectif : un nombre, ou `null` quand il est masqué (entre 1 et 4 personnes). */
export type MaskedCount = number | null;

/** Pourcentage entier, ou `null` quand la base compte moins de 5 personnes. */
export type MaskedPercent = number | null;

export interface CourseStats {
  courseId: string;
  title: string;
  branch: string;
  /** Personnes inscrites. */
  enrolled: MaskedCount;
  /** Au moins une leçon terminée. */
  started: MaskedCount;
  /** Toutes les leçons terminées. */
  completed: MaskedCount;
  /** Personnes actives (inscription, leçon ou quiz) sur les 7 et 30 derniers jours. */
  active7: MaskedCount;
  active30: MaskedCount;
  /** Bonnes réponses aux quiz, sur toutes les tentatives. */
  quizSuccess: MaskedPercent;
}

export interface StatsOverview {
  threshold: number;
  generatedAt: string;
  /** Structures couvertes (écoles, centres, région) : des noms de structures, pas de personnes. */
  organizations: string[];
  courses: CourseStats[];
  /** Bilan de lecture et rattrapage (ticket 17), apprenants des structures couvertes. */
  remediation: {
    diagnosed: MaskedCount;
    inProgress: MaskedCount;
    completed: MaskedCount;
    /** Part des apprenants orientés dont le rattrapage est terminé (remédiation effective). */
    effectiveRate: MaskedPercent;
  };
  /** Atelier virtuel de sécurité (ticket 18), apprenants des structures couvertes. */
  workshop: {
    tried: MaskedCount;
    passed: MaskedCount;
    requested: MaskedCount;
  };
}

/**
 * Tableau de pilotage : les mêmes règles (aucun nom d'élève, petits groupes masqués), avec une
 * zone, un cycle et une période choisis, l'évolution par rapport à la période d'avant, la
 * comparaison des sous-zones et des points d'attention.
 */
export const PILOT_PERIODS = ['7', '30', '90', 'annee'] as const;
export type PilotPeriod = (typeof PILOT_PERIODS)[number];
export const PILOT_PERIOD_LABELS: Record<PilotPeriod, string> = {
  '7': '7 jours',
  '30': '30 jours',
  '90': 'Trimestre',
  annee: 'Année scolaire',
};

/** Cycles du tableau de pilotage : les six catégories d'établissement. */
export const PILOT_CYCLES = [
  'preschool',
  'primary',
  'college',
  'lycee',
  'literacy_center',
  'technical_center',
] as const;
export type PilotCycle = (typeof PILOT_CYCLES)[number];
export const PILOT_CYCLE_LABELS: Record<PilotCycle, string> = {
  preschool: 'Préscolaire',
  primary: 'Primaire',
  college: 'Collège',
  lycee: 'Lycée',
  literacy_center: 'Alphabétisation',
  technical_center: 'Technique',
};

/** État d'une zone selon sa part d'apprenants actifs. */
export type PilotState = 'alert' | 'watch' | 'ok';
/** Moins de 50 % d'actifs : en alerte ; de 50 à 64 % : à surveiller ; 65 % et plus : bon. */
export const PILOT_ALERT_BELOW = 50;
export const PILOT_OK_FROM = 65;

export function pilotState(activeRate: MaskedPercent): PilotState | null {
  if (activeRate === null) return null;
  if (activeRate < PILOT_ALERT_BELOW) return 'alert';
  if (activeRate < PILOT_OK_FROM) return 'watch';
  return 'ok';
}

/** Un chiffre clé et sa valeur sur la période d'avant (null : pas de comparaison possible). */
export interface PilotFigure {
  value: number | null;
  previous: number | null;
}

export interface PilotZoneRow {
  id: string;
  name: string;
  type: string;
  /** Établissements de la zone. */
  establishments: number;
  learners: MaskedCount;
  activeRate: MaskedPercent;
  previousActiveRate: MaskedPercent;
  completionRate: MaskedPercent;
  assignmentsRate: MaskedPercent;
  previousAssignmentsRate: MaskedPercent;
  state: PilotState | null;
  /** La zone a des sous-zones à ouvrir. */
  opens: boolean;
}

export interface PilotAlert {
  level: PilotState;
  title: string;
  detail: string;
  /** Noms de structures concernées (jamais de personnes). */
  items: string[];
}

export interface PilotOverview {
  threshold: number;
  generatedAt: string;
  period: PilotPeriod;
  cycle: PilotCycle | null;
  /** Zone affichée ; `path` va de la plus large à celle-ci (pour le fil d'Ariane). */
  zone: { id: string | null; name: string; path: Array<{ id: string | null; name: string }> };
  /** Zones qu'on peut choisir dans le filtre (DRENA, IEPP de sa zone). */
  zoneOptions: Array<{ id: string; name: string; type: string }>;
  kpis: {
    active: PilotFigure;
    completionRate: PilotFigure;
    assignmentsRate: PilotFigure;
    quizSuccess: PilotFigure;
  };
  coverage: {
    establishments: number;
    classes: number;
    teachers: number;
    learners: MaskedCount;
    publishedCourses: number;
  };
  /** Apprenants actifs par semaine, sur 12 semaines (lundi de chaque semaine). */
  weekly: Array<{ week: string; active: MaskedCount }>;
  funnel: {
    enrolled: MaskedCount;
    started: MaskedCount;
    halfway: MaskedCount;
    completed: MaskedCount;
  };
  /** Sous-zones : DRENA du pays, établissements d'une DRENA… les plus fragiles d'abord. */
  rows: PilotZoneRow[];
  /** Part d'apprenants actifs de toute la zone : le repère des lignes. */
  averageActiveRate: MaskedPercent;
  cycles: Array<{ cycle: PilotCycle; learners: MaskedCount; completionRate: MaskedPercent }>;
  alerts: PilotAlert[];
}
