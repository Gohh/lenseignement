import { GRANTABLE_ROLES } from '@lenseignement/types';

// Affichage seulement : l'API reste seule juge des droits.
export const AUTHOR_ROLES = new Set([
  'enseignant',
  'alphabetiseur',
  'referent-pedagogique',
  'chef-etablissement',
  'gestionnaire',
  'technopedagogue',
]);
export const VALIDATOR_ROLES = new Set(['referent-pedagogique', 'chef-etablissement']);
export const TEAM_ROLES = new Set([
  'chef-etablissement',
  'gestionnaire',
  'iepp',
  'conseiller-alpha',
  'administrateur',
  'superadministrateur',
]);
/** Rôles de l'espace d'administration : tout rôle d'équipe donne le tableau de bord et son menu. */
export const STAFF_ROLES = new Set([...GRANTABLE_ROLES, 'superadministrateur']);
