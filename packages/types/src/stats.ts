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
