import { z } from 'zod';
import { ORGANIZATION_TYPE_LABELS } from './team.js';

const OrganizationType = z.enum(
  Object.keys(ORGANIZATION_TYPE_LABELS) as [keyof typeof ORGANIZATION_TYPE_LABELS],
);

/** Modification d'une fiche : seuls les champs envoyés changent. */
export const UpdateOrganizationSchema = z.object({
  name: z.string().trim().min(3, 'Le nom est trop court.').max(160).optional(),
  locality: z.string().trim().min(2, 'La localité est trop courte.').max(160).optional(),
  managerName: z.string().trim().min(2, 'Le responsable est trop court.').max(160).optional(),
  managerContact: z.string().trim().max(160).optional(),
  /** Type et direction régionale : superadministrateur et administrateur seulement. */
  type: OrganizationType.optional(),
  parentId: z.string().uuid().optional(),
});

export interface OrganizationListItem {
  id: string;
  name: string;
  type: string;
  locality: string | null;
  managerName: string | null;
  managerContact: string | null;
  archivedAt: string | null;
  direction: { id: string; name: string } | null;
}

export interface OrganizationDetail extends OrganizationListItem {
  /** Établissements actifs qui en dépendent (pour une direction régionale). */
  activeChildren: number;
  cohortCount: number;
  members: Array<{ userName: string | null; role: string }>;
  can: {
    edit: boolean;
    /** Changer le type ou la direction régionale. */
    editStructure: boolean;
    archive: boolean;
  };
}
