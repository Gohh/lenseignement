/**
 * Tableau de bord de la direction : la vie de l'établissement, classe par classe, et les élèves à
 * suivre. Seulement pour qui gère l'établissement (direction, gestionnaire, administration).
 */

/** Plus d'activité depuis ce nombre de jours : l'élève est signalé. */
export const INACTIVE_DAYS = 14;
/** Moyenne sous ce seuil (sur 20) : l'élève est signalé. */
export const LOW_AVERAGE = 10;
/** Devoirs non rendus après la date limite à partir desquels l'élève est signalé. */
export const MISSING_ASSIGNMENTS = 2;

export interface DirectionClass {
  id: string;
  name: string;
  levelLabel: string | null;
  teachers: string[];
  learnerCount: number;
  /** Élèves actifs ces 7 derniers jours (leçon, quiz ou devoir rendu). */
  activeLast7Days: number;
  assignmentCount: number;
  /** Part des copies rendues sur les devoirs dont la date est passée ; null sans devoir échu. */
  submissionRate: number | null;
  /** Moyenne de la classe sur 20 (coefficients compris) ; null sans note. */
  average: number | null;
  /** Élèves signalés dans cette classe. */
  toFollow: number;
}

export interface LearnerToFollow {
  userId: string;
  name: string;
  cohortId: string;
  cohortName: string;
  /** Raisons, en clair : « Pas d'activité depuis 20 jours », « Moyenne 8,5/20 »… */
  reasons: string[];
}

export interface DirectionOverview {
  /** Établissements que la personne peut choisir. */
  organizations: Array<{ id: string; name: string }>;
  organization: { id: string; name: string } | null;
  schoolYears: string[];
  schoolYear: string | null;
  totals: {
    classes: number;
    learners: number;
    teachers: number;
    activeLast7Days: number;
    toFollow: number;
  };
  classes: DirectionClass[];
  toFollow: LearnerToFollow[];
}
