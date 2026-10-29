import type { LevelCode } from './levels.js';

export type LevelRequestStatus = 'pending' | 'approved' | 'declined';

/** Passage au niveau supérieur : demandé par l'apprenant, validé par son parent ou son enseignant. */
export interface LevelPromotion {
  level: LevelCode | null;
  nextLevel: LevelCode | null;
  /** Demande en attente de validation. */
  pending: boolean;
  /** Vrai si la personne qui consulte peut valider ou faire passer l'apprenant (parent, enseignant). */
  canDecide: boolean;
}
