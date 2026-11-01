import type { Me } from './api';
import type { MenuIconName } from '@/components/MenuIcon';
import { AUTHOR_ROLES, STAFF_ROLES, TEAM_ROLES, VALIDATOR_ROLES } from './roles';

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
          { href: '/mon-espace/configuration', label: 'Établissements' },
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
  items: StaffMenuItem[];
  /** Replié à l'ouverture de la page (il s'ouvre quand même s'il contient la page en cours). */
  closed?: boolean;
}

/** Entrée du menu d'administration, avec son pictogramme. */
export interface StaffMenuItem extends SpaceMenuItem {
  icon: MenuIconName;
}

export interface StaffMenu {
  main: StaffMenuItem[];
  groups: StaffMenuGroup[];
  /** Gère une équipe, rédige ou relit : sinon le tableau de bord ne montre que des chiffres. */
  manages: boolean;
}

/** Rôles qui suivent plusieurs structures : ils voient les DRENA, services et partenaires. */
const NETWORK_ROLES = new Set(['gestionnaire', 'iepp', 'conseiller-alpha']);

/**
 * Menu de l'espace d'administration (tous les rôles d'équipe : cabinet, DRENA, APFC, IEPP,
 * direction, censeur, relecteurs, administrateurs…) : le tableau de bord, puis des rubriques par
 * intention (piloter, enseigner, contenus, réseau scolaire, personnes, administration). Chaque
 * entrée suit les droits réglés dans l'écran « Droits ». Renvoie null pour les apprenants,
 * parents, etc., qui gardent le menu simple.
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
  const teaching = memberRoles.has('enseignant') || memberRoles.has('chef-etablissement');
  // Droits réglés par le superadministrateur (écran « Droits ») ; sans réponse, les rôles suffisent.
  const right = (code: string, fallback: boolean) =>
    me?.rights ? me.rights.includes(code) : fallback;
  const programmes =
    right('programmes-importer', admin) ||
    right('programmes-publier', memberRoles.has('referent-pedagogique'));
  const staff = [...roles].some((role) => STAFF_ROLES.has(role));
  if (!staff && !team && !author && !validator) return null;
  const when = <T>(condition: boolean, items: T[]): T[] => (condition ? items : []);

  const main: StaffMenuItem[] = [
    { href: '/mon-espace', label: 'Tableau de bord', icon: 'accueil' },
  ];
  const groups: StaffMenuGroup[] = [
    {
      title: 'Piloter',
      items: [
        ...when(right('suivi', team), [
          { href: '/mon-espace/suivi', label: 'Suivi de l’établissement', icon: 'suivi' as const },
        ]),
        ...when(right('statistiques', validator || team), [
          {
            href: '/mon-espace/statistiques',
            label: 'Statistiques',
            icon: 'statistiques' as const,
          },
        ]),
      ],
    },
    {
      title: 'Enseigner',
      items: [
        ...when(teaching, [
          { href: '/mon-espace/classe', label: 'Classe virtuelle', icon: 'classe' as const },
          { href: '/mon-espace/devoirs', label: 'Devoirs', icon: 'devoirs' as const },
          { href: '/mon-espace/evaluations', label: 'Évaluations', icon: 'evaluations' as const },
          {
            href: '/mon-espace/bibliotheque',
            label: 'Bibliothèque',
            icon: 'bibliotheque' as const,
          },
          { href: '/mon-espace/messages', label: 'Messages', icon: 'messages' as const },
        ]),
        ...when(teaching || admin, [
          {
            href: '/mon-espace/questions',
            label: 'Questions des élèves',
            icon: 'questions' as const,
          },
        ]),
      ],
    },
    {
      title: 'Contenus',
      items: [
        ...when(author || validator, [
          { href: '/mon-espace/travail', label: 'Mon travail', icon: 'travail' as const },
        ]),
        ...when(author, [
          { href: '/mon-espace/cours', label: 'Cours', section: true, icon: 'cours' as const },
        ]),
        ...when(validator, [
          { href: '/mon-espace/relecture', label: 'Relecture', icon: 'relecture' as const },
        ]),
        ...when(programmes, [
          {
            href: '/mon-espace/configuration/programmes',
            label: 'Programmes',
            section: true,
            icon: 'programmes' as const,
          },
        ]),
      ],
    },
    {
      title: 'Réseau scolaire',
      items: [
        ...when(team, [
          {
            href: '/mon-espace/configuration',
            label: 'Établissements',
            section: '/mon-espace/configuration/etablissements',
            icon: 'etablissements' as const,
          },
        ]),
        ...when(admin || has(NETWORK_ROLES), [
          {
            href: '/mon-espace/configuration/drena',
            label: 'Directions régionales',
            icon: 'drena' as const,
          },
          {
            href: '/mon-espace/configuration/services',
            label: 'Services et partenaires',
            icon: 'services' as const,
          },
        ]),
      ],
    },
    {
      title: 'Personnes',
      items: [
        ...when(team, [
          { href: '/mon-espace/equipe', label: 'Équipe', icon: 'equipe' as const },
          { href: '/mon-espace/invitations', label: 'Invitations', icon: 'invitations' as const },
        ]),
        ...when(team && right('comptes', admin), [
          { href: '/mon-espace/comptes', label: 'Comptes', icon: 'comptes' as const },
        ]),
      ],
    },
    {
      title: 'Administration',
      items: [
        ...when(superAdmin, [
          { href: '/mon-espace/droits', label: 'Droits', icon: 'droits' as const },
        ]),
        ...when(team && right('journal', admin), [
          { href: '/mon-espace/journal', label: 'Journal des actions', icon: 'journal' as const },
        ]),
      ],
    },
    {
      // Lecture seule (superadministrateur, administrateurs) : replié par défaut.
      title: 'Consulter',
      closed: true,
      items: when(right('consulter', admin), [
        { href: '/mon-espace/consulter/cours', label: 'Cours', icon: 'consulter' as const },
        { href: '/mon-espace/consulter/classes', label: 'Classes', icon: 'consulter' as const },
        { href: '/mon-espace/consulter/devoirs', label: 'Devoirs', icon: 'consulter' as const },
        {
          href: '/mon-espace/consulter/evaluations',
          label: 'Évaluations',
          icon: 'consulter' as const,
        },
      ]),
    },
  ];
  return {
    main,
    groups: groups.filter((g) => g.items.length > 0),
    manages: team || author || validator,
  };
}
