import type { Me } from './api';
import { AUTHOR_ROLES, TEAM_ROLES, VALIDATOR_ROLES } from './roles';

export interface SpaceMenuItem {
  href: string;
  label: string;
  section?: boolean;
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
          { href: '/mon-espace/aide', label: 'Aide et tutorat' },
        ]
      : []),
    ...(parent ? [{ href: '/mon-espace/famille', label: 'Ma famille' }] : []),
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
  const admin = sessionRoles.some((r) => r === 'superadministrateur' || r === 'administrateur');
  const team = admin || has(TEAM_ROLES);
  const author = has(AUTHOR_ROLES);
  const validator = has(VALIDATOR_ROLES);
  if (!team && !author && !validator) return null;
  const main: SpaceMenuItem[] = [
    { href: '/mon-espace', label: 'Tableau de bord' },
    ...(author || validator ? [{ href: '/mon-espace/travail', label: 'Mon travail' }] : []),
    ...(author ? [{ href: '/mon-espace/cours', label: 'Cours', section: true }] : []),
    ...(validator ? [{ href: '/mon-espace/relecture', label: 'Relecture' }] : []),
    ...(memberRoles.has('enseignant') || memberRoles.has('chef-etablissement')
      ? [{ href: '/mon-espace/questions', label: 'Questions des élèves' }]
      : []),
    ...(validator || team ? [{ href: '/mon-espace/statistiques', label: 'Statistiques' }] : []),
  ];
  const groups: StaffMenuGroup[] = [
    ...(team
      ? [
          {
            title: 'Référentiels',
            items: [{ href: '/mon-espace/configuration', label: 'Établissements', section: true }],
          },
          {
            title: 'Comptes et droits',
            items: [{ href: '/mon-espace/equipe', label: 'Équipe et invitations' }],
          },
        ]
      : []),
  ];
  return { main, groups };
}
