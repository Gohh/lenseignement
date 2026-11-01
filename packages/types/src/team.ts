import { z } from 'zod';
import { BRANCH_CODES } from './branches.js';
import { LEVEL_CODES } from './levels.js';

/**
 * Rôles d'équipe qu'on peut accorder (invitation, formulaire ou import). Le superadministrateur
 * se donne par la commande, jamais depuis l'écran.
 */
export const GRANTABLE_ROLES = [
  // National
  'administrateur',
  'cabinet',
  'direction-centrale',
  'partenaire',
  'technopedagogue',
  'referent-pedagogique',
  // Régional et local
  'gestionnaire',
  'apfc',
  'iepp',
  'conseiller-pedagogique',
  'conseiller-alpha',
  // Établissement
  'chef-etablissement',
  'censeur',
  'correspondant-fichier',
  'educateur',
  'conseiller-orientation',
  'enseignant',
  'alphabetiseur',
] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

/** Administrateurs (secours du superadministrateur) : trois au plus sur la plateforme. */
export const MAX_ADMINISTRATORS = 3;

export const TEAM_ROLE_LABELS: Record<string, string> = {
  superadministrateur: 'Superadministrateur',
  administrateur: 'Administrateur',
  cabinet: 'Cabinet',
  'direction-centrale': 'Direction centrale',
  partenaire: 'Partenaire technique et financier',
  technopedagogue: 'Technopédagogue',
  'referent-pedagogique': 'Référent pédagogique',
  gestionnaire: 'DRENA',
  apfc: 'APFC',
  iepp: 'IEPP (inspection)',
  'conseiller-pedagogique': 'Conseiller pédagogique',
  'conseiller-alpha': 'Conseiller Alpha',
  'chef-etablissement': 'Chef d’établissement (directeur, principal, proviseur)',
  censeur: 'Censeur',
  'correspondant-fichier': 'Correspondant fichier',
  educateur: 'Éducateur',
  'conseiller-orientation': 'Conseiller d’orientation',
  enseignant: 'Enseignant ou formateur',
  alphabetiseur: 'Alphabétiseur',
};

const SCHOOLS = [
  'preschool',
  'primary',
  'college',
  'lycee',
  'literacy_center',
  'technical_center',
] as const;
const SECONDARY = ['college', 'lycee', 'technical_center'] as const;

/**
 * Structures où chaque rôle peut être donné. `null` : partout (le technopédagogue et le référent
 * se rattachent à la structure qui les emploie).
 */
export const ROLE_STRUCTURES: Record<GrantableRole, readonly string[] | null> = {
  administrateur: null,
  cabinet: ['ministry'],
  'direction-centrale': ['central_direction'],
  partenaire: ['partner'],
  technopedagogue: null,
  'referent-pedagogique': null,
  gestionnaire: ['authority'],
  apfc: ['apfc'],
  iepp: ['iepp'],
  'conseiller-pedagogique': ['iepp'],
  'conseiller-alpha': ['authority'],
  'chef-etablissement': SCHOOLS,
  censeur: SECONDARY,
  'correspondant-fichier': SCHOOLS,
  educateur: SECONDARY,
  'conseiller-orientation': [...SECONDARY, 'authority'],
  enseignant: SCHOOLS,
  alphabetiseur: SCHOOLS,
};

/** Le rôle se donne-t-il dans ce type de structure ? */
export function roleFitsStructure(role: string, type: string): boolean {
  const allowed = ROLE_STRUCTURES[role as GrantableRole];
  if (allowed === undefined) return false;
  return allowed === null || allowed.includes(type);
}

/**
 * Qui nomme qui. Le superadministrateur nomme tout le monde ; l'administrateur tout le monde sauf
 * un administrateur. Les autres, seulement dans leur structure (et ce qui en dépend).
 */
export const NAMES_BY_ROLE: Record<string, readonly GrantableRole[]> = {
  gestionnaire: [
    'chef-etablissement',
    'apfc',
    'iepp',
    'conseiller-alpha',
    'conseiller-orientation',
    'enseignant',
    'alphabetiseur',
    'referent-pedagogique',
  ],
  iepp: ['chef-etablissement', 'conseiller-pedagogique'],
  'conseiller-alpha': ['alphabetiseur'],
  'chef-etablissement': [
    'censeur',
    'correspondant-fichier',
    'educateur',
    'conseiller-orientation',
    'enseignant',
    'alphabetiseur',
  ],
};

/** Rôles qui nomment d'autres personnes (en plus du superadministrateur et de l'administrateur). */
export const NAMING_ROLES = Object.keys(NAMES_BY_ROLE);

/**
 * Titre affiché pour un rôle dans une structure : le chef d'établissement s'appelle directeur
 * d'école, principal ou proviseur selon l'établissement.
 */
export function roleTitle(role: string, organizationType?: string | null): string {
  if (role === 'chef-etablissement') {
    switch (organizationType) {
      case 'preschool':
      case 'primary':
        return 'Directeur d’école';
      case 'college':
        return 'Principal';
      case 'lycee':
      case 'technical_center':
        return 'Proviseur';
      case 'literacy_center':
        return 'Responsable du centre';
    }
  }
  return TEAM_ROLE_LABELS[role] ?? role;
}

const Branches = z.array(z.enum(BRANCH_CODES)).min(1, 'Choisissez au moins un cycle.').nullable();

export const CreateTeamInvitationSchema = z.object({
  organizationId: z.string().uuid(),
  role: z.enum(GRANTABLE_ROLES),
  branches: Branches,
  /** Durée de validité du code, en jours (7 par défaut). */
  days: z.number().int().min(1).max(30).optional(),
});

/** Création d'un compte d'équipe par le superadministrateur, l'administrateur ou la direction. */
export const CreateAccountSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v.split(/\s+/).length >= 2, 'Écrivez le prénom puis le nom.'),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(200),
  organizationId: z.string().uuid(),
  role: z.enum(GRANTABLE_ROLES),
  branches: Branches,
});

export interface CreatedAccount {
  email: string;
  displayName: string;
  organization: string;
  role: string;
  /** Affiché une seule fois : la personne doit le changer à sa première connexion. */
  temporaryPassword: string;
}

export const ORGANIZATION_TYPE_LABELS = {
  preschool: 'Établissement préscolaire',
  primary: 'École primaire',
  college: 'Collège',
  lycee: 'Lycée',
  literacy_center: 'Centre d’alphabétisation',
  technical_center: 'Établissement d’enseignement technique',
  authority: 'Direction régionale (DRENA)',
  ministry: 'Cabinet du ministère',
  central_direction: 'Direction centrale',
  apfc: 'Antenne de la pédagogie et de la formation continue (APFC)',
  iepp: 'Inspection de l’enseignement préscolaire et primaire (IEPP)',
  partner: 'Partenaire technique et financier',
} as const;

export type OrganizationTypeCode = keyof typeof ORGANIZATION_TYPE_LABELS;

/**
 * Services et partenaires : ni direction régionale ni établissement. Le cabinet et les directions
 * centrales sont nationaux ; l'APFC et l'IEPP dépendent d'une DRENA ; un partenaire est national
 * ou régional.
 */
export const SERVICE_TYPES = ['ministry', 'central_direction', 'apfc', 'iepp', 'partner'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const isServiceType = (type: string): type is ServiceType =>
  (SERVICE_TYPES as readonly string[]).includes(type);

/** Court libellé pour les listes et les badges. */
export const SERVICE_SHORT_LABELS: Record<ServiceType, string> = {
  ministry: 'Cabinet',
  central_direction: 'Direction centrale',
  apfc: 'APFC',
  iepp: 'IEPP',
  partner: 'Partenaire',
};

/** Courte explication affichée dans le formulaire de création. */
export const SERVICE_TYPE_HINTS: Record<ServiceType, string> = {
  ministry: 'Le cabinet du ministre : il suit les chiffres de tout le pays.',
  central_direction: 'Une direction du ministère (DPFC, DSPS…), nationale.',
  apfc: 'Antenne de formation continue des enseignants, rattachée à une DRENA.',
  iepp: 'Inspection d’une circonscription du préscolaire et du primaire, dans une DRENA.',
  partner: 'Partenaire technique et financier (PTF), national ou rattaché à une DRENA.',
};

/**
 * Rattachement de chaque type de structure : aucun (national ou DRENA), une DRENA obligatoire, ou
 * une DRENA facultative.
 */
export function parentRuleOf(type: string): 'none' | 'drena' | 'optional' {
  if (type === 'authority' || type === 'ministry' || type === 'central_direction') return 'none';
  if (type === 'partner') return 'optional';
  return 'drena';
}

/** Famille d'une structure : on ne passe pas d'une famille à l'autre en modifiant sa fiche. */
export function organizationFamily(type: string): 'direction' | 'service' | 'etablissement' {
  if (type === 'authority') return 'direction';
  return isServiceType(type) ? 'service' : 'etablissement';
}

const Short = (label: string, min = 2) =>
  z.string().trim().min(min, `${label} : trop court.`).max(160);

export const CreateOrganizationSchema = z.object({
  /** Nom officiel de l'établissement (ou de la direction régionale). */
  name: Short('Le nom officiel', 3),
  type: z.enum(Object.keys(ORGANIZATION_TYPE_LABELS) as [keyof typeof ORGANIZATION_TYPE_LABELS]),
  /** Direction régionale dont il dépend ; obligatoire, sauf pour créer une direction régionale. */
  parentId: z.string().uuid().nullable().optional(),
  locality: z.string().trim().max(160).optional(),
  managerName: z.string().trim().max(160).optional(),
  managerContact: z.string().trim().max(160).optional(),
});

export const ImportOrganizationsSchema = z.object({
  csv: z.string().min(1, 'Le fichier est vide.').max(300_000, 'Le fichier est trop gros.'),
  confirm: z.boolean(),
});

export interface OrganizationImportLine {
  line: number;
  name: string;
  status: 'create' | 'exists' | 'error';
  message: string;
}

export interface CreatedOrganization {
  id: string;
  name: string;
  /** Code d'invitation du responsable, seulement si la personne peut donner une direction. */
  managerCode: string | null;
}

export interface OrganizationImportResult {
  lines: OrganizationImportLine[];
  /** Nombre d'établissements créés (0 pour un simple aperçu). */
  created: number;
  confirmed: boolean;
}

/** Rôles qui enseignent : ils choisissent leurs niveaux et matières, puis la direction valide. */
export const TEACHING_ROLES = ['enseignant', 'alphabetiseur'] as const;

const Subjects = z
  .array(z.string().trim().min(2, 'Matière trop courte.').max(60))
  .min(1, 'Choisissez au moins une matière.')
  .max(30);
const Levels = z.array(z.enum(LEVEL_CODES)).min(1, 'Choisissez au moins un niveau.');

export const RedeemTeamInvitationSchema = z.object({
  code: z.string().trim().min(4).max(20),
  /** Pour un rôle qui enseigne : ses niveaux et ses matières, soumis à la direction. */
  levels: Levels.optional(),
  subjects: Subjects.optional(),
});

/** La direction valide une demande, en corrigeant au besoin niveaux et matières. */
export const DecideJoinRequestSchema = z.object({ levels: Levels, subjects: Subjects });

/** Ce que la personne voit après avoir saisi le code, avant d'envoyer sa demande. */
export interface InvitationPreview {
  organization: string;
  role: string;
  /** Vrai pour un rôle qui enseigne : fiche à remplir, puis validation par la direction. */
  needsValidation: boolean;
  /** Niveaux proposés selon le type d'établissement. */
  levels: Array<{ code: string; title: string }>;
  /** Matières des programmes publiés pour ces niveaux (peut être vide). */
  subjects: string[];
}

export type JoinRequestStatus = 'pending' | 'approved' | 'refused';

export const JOIN_REQUEST_STATUS_LABELS: Record<JoinRequestStatus, string> = {
  pending: 'En attente de validation par la direction',
  approved: 'Validée',
  refused: 'Refusée',
};

export interface JoinRequest {
  id: string;
  userName: string | null;
  role: string;
  organization: { id: string; name: string };
  levels: string[];
  subjects: string[];
  status: JoinRequestStatus;
  createdAt: string;
  /** Niveaux possibles dans cet établissement (pour corriger avant de valider). */
  levelOptions: Array<{ code: string; title: string }>;
}

export interface RedeemResult {
  organization: string;
  role: string;
  /** Vrai quand la demande attend la validation de la direction. */
  pending: boolean;
}

export const UpdateTeamMemberSchema = z.object({ branches: Branches });

export interface TeamMember {
  id: string;
  userName: string | null;
  role: string;
  /** `type` : pour le titre (directeur d'école, principal, proviseur). */
  organization: { id: string; name: string; type?: string };
  /** Cycles accordés ; null = tous. */
  branches: string[] | null;
  /** Niveaux et matières validés par la direction (null : pas encore précisés). */
  levels: string[] | null;
  subjects: string[] | null;
  isSelf: boolean;
}

export interface TeamOverview {
  organizations: Array<{ id: string; name: string }>;
  members: TeamMember[];
  /** Rôles que la personne peut accorder. */
  grantable: string[];
  /** Seul le superadministrateur crée des établissements. */
  canCreateOrganization: boolean;
  /** Voit toutes les structures (superadministrateur et administrateur). */
  everywhere: boolean;
  /** Directions régionales que la personne voit, à choisir à la création d'un établissement. */
  directions: Array<{ id: string; name: string }>;
}

export type InvitationState = 'active' | 'used' | 'expired' | 'revoked';

export const INVITATION_STATE_LABELS: Record<InvitationState, string> = {
  active: 'Active',
  used: 'Utilisée',
  expired: 'Expirée',
  revoked: 'Révoquée',
};

export interface TeamInvitation {
  id: string;
  code: string;
  role: string;
  organization: { id: string; name: string };
  createdAt: string;
  expiresAt: string;
  createdByName: string | null;
  usedByName: string | null;
  usedAt: string | null;
  state: InvitationState;
  /** Nombre de personnes qui ont saisi ce code. */
  uses: number;
  /** null : sans limite de personnes. */
  maxUses: number | null;
}

export interface InvitationList {
  organizations: Array<{ id: string; name: string }>;
  /** Rôles que la personne peut accorder. */
  grantable: string[];
  items: TeamInvitation[];
}

export interface JoinRequestList {
  items: JoinRequest[];
}
