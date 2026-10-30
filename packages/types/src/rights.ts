import { z } from 'zod';

/**
 * Écran « Droits » (superadministrateur) : chaque profil d'équipe a des droits par défaut ; le
 * superadministrateur peut en retirer, puis les rendre. Le superadministrateur garde tout.
 */
export const RIGHT_PROFILES = [
  'administrateur',
  'gestionnaire',
  'chef-etablissement',
  'referent-pedagogique',
] as const;
export type RightProfile = (typeof RIGHT_PROFILES)[number];

export const RIGHT_CODES = [
  'etablissements',
  'equipe',
  'comptes',
  'journal',
  'programmes-importer',
  'programmes-publier',
  'consulter',
  'suivi',
  'statistiques',
] as const;
export type RightCode = (typeof RIGHT_CODES)[number];

export interface RightDefinition {
  code: RightCode;
  label: string;
  description: string;
  /** Profils qui ont ce droit par défaut ; les autres ne peuvent pas le recevoir. */
  profiles: readonly RightProfile[];
}

export const RIGHT_DEFINITIONS: readonly RightDefinition[] = [
  {
    code: 'etablissements',
    label: 'Créer des établissements',
    description: 'Créer, importer, modifier et archiver des DRENA et des écoles.',
    profiles: ['administrateur', 'gestionnaire'],
  },
  {
    code: 'equipe',
    label: 'Inviter l’équipe',
    description: 'Inviter des personnes et leur donner un rôle.',
    profiles: ['administrateur', 'gestionnaire', 'chef-etablissement'],
  },
  {
    code: 'comptes',
    label: 'Gérer les comptes',
    description: 'Créer, importer, modifier, suspendre et supprimer des comptes.',
    profiles: ['administrateur'],
  },
  {
    code: 'journal',
    label: 'Voir le journal',
    description: 'Lire le journal des actions.',
    profiles: ['administrateur'],
  },
  {
    code: 'programmes-importer',
    label: 'Importer des programmes',
    description: 'Importer et supprimer des brouillons de programme.',
    profiles: ['administrateur', 'referent-pedagogique'],
  },
  {
    code: 'programmes-publier',
    label: 'Publier les programmes',
    description: 'Publier un programme avec sa date d’entrée en vigueur.',
    profiles: ['referent-pedagogique'],
  },
  {
    code: 'consulter',
    label: 'Consulter',
    description: 'Voir les cours, classes, devoirs et évaluations de toute la plateforme.',
    profiles: ['administrateur'],
  },
  {
    code: 'suivi',
    label: 'Suivi de l’établissement',
    description: 'Voir les classes et les élèves à suivre.',
    profiles: ['administrateur', 'gestionnaire', 'chef-etablissement'],
  },
  {
    code: 'statistiques',
    label: 'Statistiques',
    description: 'Voir les chiffres anonymes.',
    profiles: ['administrateur', 'chef-etablissement', 'referent-pedagogique'],
  },
];

export const WithdrawnRightSchema = z.object({
  profile: z.enum(RIGHT_PROFILES),
  right: z.enum(RIGHT_CODES),
});
export type WithdrawnRight = z.infer<typeof WithdrawnRightSchema>;

/** Remplace la liste des droits retirés. */
export const SetRightsSchema = z.object({
  withdrawn: z.array(WithdrawnRightSchema).max(RIGHT_PROFILES.length * RIGHT_CODES.length),
});

export interface RightsOverview {
  withdrawn: WithdrawnRight[];
}
