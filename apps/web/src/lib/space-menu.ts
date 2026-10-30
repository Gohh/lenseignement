import type { Me } from './api';
import { AUTHOR_ROLES, TEAM_ROLES, VALIDATOR_ROLES } from './roles';

export interface SpaceMenuItem {
  href: string;
  label: string;
  /** Actif aussi sur les pages en dessous (ou sous le chemin donné). */
  section?: boolean | string;
}

/** Entrées du menu de l'espace personnel, selon les rôles : même liste dans l'en-tête et le menu latéral. */
export function spaceMenuItems(sessionRoles: readonly string[], me: Me | null): SpaceMenuItem[] {
  const memberRoles = new Set(me ? me.memberships.map((m) => m.role) : []);
  const has = (roles: Set<string>) => [...memberRoles].some((role) => roles.has(role));
  // Le menu suit les profils choisis à l'inscription (et les rôles déjà portés par le compte).
  const profiles = new Set(me?.profiles ?? []);
  const learner = profiles.has('apprenant') || sessionRoles.includes('apprenant');
  const parent = profiles.has('parent') || sessionRoles.includes('parent');
  const tutor = profiles.has('repetiteur') || sessionRoles.includes('repetiteur');
  return [
    { href: '/mon-espace', label: 'Vue d’ensemble' },
    ...(learner
      ? [
          { href: '/mon-espace/bilan-lecture', label: 'Mon bilan' },
          { href: '/mon-espace/atelier-securite', label: 'Atelier' },
          { href: '/mon-espace/classe', label: 'Ma classe' },
          { href: '/mon-espace/devoirs', label: 'Mes devoirs' },
          { href: '/mon-espace/evaluations', label: 'Mes notes' },
          { href: '/mon-espace/bibliotheque', label: 'Bibliothèque' },
          { href: '/mon-espace/reussites', label: 'Mes réussites' },
          { href: '/mon-espace/aide', label: 'Aide et tutorat' },
        ]
      : []),
    ...(parent
      ? [
          { href: '/mon-espace/famille', label: 'Ma famille' },
          { href: '/mon-espace/messages', label: 'Messages' },
        ]
      : []),
    ...(tutor
      ? [
          { href: '/mon-espace/repetiteur', label: 'Mes élèves' },
          { href: '/mon-espace/questions', label: 'Questions des élèves' },
        ]
      : []),
    ...(has(TEAM_ROLES)
      ? [
          { href: '/mon-espace/equipe', label: 'Équipe' },
          { href: '/mon-espace/configuration', label: 'Configuration' },
        ]
      : []),
    ...(has(AUTHOR_ROLES) ? [{ href: '/mon-espace/cours', label: 'Rédiger', section: true }] : []),
    ...(has(VALIDATOR_ROLES)
      ? [
          { href: '/mon-espace/relecture', label: 'Relecture' },
          { href: '/mon-espace/statistiques', label: 'Statistiques' },
        ]
      : []),
  ];
}

export interface StaffMenuGroup {
  title: string;
  items: SpaceMenuItem[];
}

export interface StaffMenu {
  main: SpaceMenuItem[];
  groups: StaffMenuGroup[];
}

/**
 * Menu de l'espace d'administration (direction, gestionnaires, relecteurs, administrateurs) :
 * entrées principales puis groupes repliables. Renvoie null pour les apprenants, parents, etc.,
 * qui gardent le menu simple.
 */
export function staffMenu(sessionRoles: readonly string[], me: Me | null): StaffMenu | null {
  const memberRoles = new Set(me ? me.memberships.map((m) => m.role) : []);
  const has = (roles: Set<string>) => [...memberRoles].some((role) => roles.has(role));
  // Rôle reçu dans le jeton ou rattachement (le superadministrateur peut n'avoir que le second).
  const roles = new Set([...sessionRoles, ...memberRoles]);
  const superAdmin = roles.has('superadministrateur');
  const admin = superAdmin || roles.has('administrateur');
  const team = admin || has(TEAM_ROLES);
  const author = has(AUTHOR_ROLES);
  const validator = has(VALIDATOR_ROLES);
  if (!team && !author && !validator) return null;
  const main: SpaceMenuItem[] = [
    { href: '/mon-espace', label: 'Tableau de bord' },
    ...(team ? [{ href: '/mon-espace/suivi', label: 'Suivi de l’établissement' }] : []),
    ...(author || validator ? [{ href: '/mon-espace/travail', label: 'Mon travail' }] : []),
    ...(author ? [{ href: '/mon-espace/cours', label: 'Cours', section: true }] : []),
    ...(validator ? [{ href: '/mon-espace/relecture', label: 'Relecture' }] : []),
    ...(memberRoles.has('enseignant') || memberRoles.has('chef-etablissement')
      ? [
          { href: '/mon-espace/classe', label: 'Classe virtuelle' },
          { href: '/mon-espace/devoirs', label: 'Devoirs' },
          { href: '/mon-espace/evaluations', label: 'Évaluations' },
          { href: '/mon-espace/bibliotheque', label: 'Bibliothèque' },
          { href: '/mon-espace/messages', label: 'Messages' },
        ]
      : []),
    ...(memberRoles.has('enseignant') || memberRoles.has('chef-etablissement') || admin
      ? [{ href: '/mon-espace/questions', label: 'Questions des élèves' }]
      : []),
    ...(validator || team ? [{ href: '/mon-espace/statistiques', label: 'Statistiques' }] : []),
  ];
  const groups: StaffMenuGroup[] = [
    ...(team
      ? [
          {
            title: 'Référentiels',
            items: [
              {
                href: '/mon-espace/configuration',
                label: 'Établissements',
                section: '/mon-espace/configuration/etablissements',
              },
              ...(admin
                ? [
                    {
                      href: '/mon-espace/configuration/programmes',
                      label: 'Programmes',
                      section: true,
                    },
                  ]
                : []),
            ],
          },
          {
            title: 'Comptes et droits',
            items: [
              { href: '/mon-espace/equipe', label: 'Équipe et invitations' },
              ...(admin ? [{ href: '/mon-espace/comptes', label: 'Comptes' }] : []),
              ...(admin ? [{ href: '/mon-espace/journal', label: 'Journal des actions' }] : []),
            ],
          },
        ]
      : []),
  ];
  return { main, groups };
}
