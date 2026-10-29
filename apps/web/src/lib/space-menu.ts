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
  const learner = sessionRoles.includes('apprenant');
  return [
    { href: '/mon-espace', label: 'Vue d’ensemble' },
    ...(learner
      ? [
          { href: '/mon-espace/bilan-lecture', label: 'Mon bilan' },
          { href: '/mon-espace/atelier-securite', label: 'Atelier' },
        ]
      : []),
    { href: '/mon-espace/famille', label: 'Ma famille' },
    { href: '/mon-espace/repetiteur', label: 'Répétiteur' },
    ...(has(TEAM_ROLES) ? [{ href: '/mon-espace/equipe', label: 'Équipe' }] : []),
    ...(has(AUTHOR_ROLES) ? [{ href: '/mon-espace/cours', label: 'Rédiger', section: true }] : []),
    ...(has(VALIDATOR_ROLES)
      ? [
          { href: '/mon-espace/relecture', label: 'Relecture' },
          { href: '/mon-espace/statistiques', label: 'Statistiques' },
        ]
      : []),
  ];
}
