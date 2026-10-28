// Affichage seulement : l'API reste seule juge des droits.
export const AUTHOR_ROLES = new Set([
  'enseignant',
  'alphabetiseur',
  'referent-pedagogique',
  'chef-etablissement',
  'gestionnaire',
]);
export const VALIDATOR_ROLES = new Set(['referent-pedagogique', 'chef-etablissement']);
export const TEAM_ROLES = new Set(['chef-etablissement', 'administrateur', 'superadministrateur']);
