import { z } from 'zod';
import { BRANCH_CODES } from './branches.js';

/** Rôles qu'on peut accorder par invitation ; « chef-etablissement » seulement par un superadministrateur. */
export const GRANTABLE_ROLES = [
  'gestionnaire',
  'enseignant',
  'alphabetiseur',
  'referent-pedagogique',
  'administrateur',
  'chef-etablissement',
] as const;

export const TEAM_ROLE_LABELS: Record<string, string> = {
  gestionnaire: 'Gestionnaire',
  enseignant: 'Enseignant ou formateur',
  alphabetiseur: 'Alphabétiseur',
  'referent-pedagogique': 'Référent pédagogique',
  administrateur: 'Administrateur',
  'chef-etablissement': 'Direction de l’établissement',
  superadministrateur: 'Superadministrateur',
};

const Branches = z.array(z.enum(BRANCH_CODES)).min(1, 'Choisissez au moins un cycle.').nullable();

export const CreateTeamInvitationSchema = z.object({
  organizationId: z.string().uuid(),
  role: z.enum(GRANTABLE_ROLES),
  branches: Branches,
});

export const ORGANIZATION_TYPE_LABELS = {
  primary_public: 'Primaire public',
  primary_private: 'Primaire privé',
  college: 'Collège',
  lycee: 'Lycée (secondaire public)',
  secondary_private: 'Secondaire privé',
  technical_center: 'Centre de formation technique',
  literacy_center: 'Centre d’alphabétisation',
  authority: 'Autorité (inspection, direction régionale)',
  partner: 'Partenaire',
} as const;

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

export const RedeemTeamInvitationSchema = z.object({ code: z.string().trim().min(4).max(20) });

export const UpdateTeamMemberSchema = z.object({ branches: Branches });

export interface TeamMember {
  id: string;
  userName: string | null;
  role: string;
  organization: { id: string; name: string };
  /** Cycles accordés ; null = tous. */
  branches: string[] | null;
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
