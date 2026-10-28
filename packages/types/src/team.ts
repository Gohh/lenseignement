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
}
