import { z } from 'zod';
import {
  ESTABLISHMENT_COLUMN_KEYS,
  type EstablishmentChange,
  type EstablishmentValue,
} from './establishments.js';
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
  status: string | null;
  officialCode: string | null;
  municipality: string | null;
  phone: string | null;
  email: string | null;
  openedYear: number | null;
  /** Champs propres à la catégorie (IEPP, sections, filières…). */
  details: Record<string, string | number | string[]>;
}

/** Ligne du tableau : les actions permises à la personne connectée. */
export interface OrganizationListEntry extends OrganizationListItem {
  can: { edit: boolean; archive: boolean };
}

/** Établissement affiché en haut de l'espace : « L'Enseignement à … ». */
export interface MyEstablishment {
  name: string;
  /** Direction régionale (DRENA) de l'établissement. */
  direction: string | null;
  locality: string | null;
}

export interface OrganizationDetail extends OrganizationListItem {
  /** Établissements actifs qui en dépendent (pour une direction régionale). */
  activeChildren: number;
  cohortCount: number;
  members: Array<{ userName: string | null; role: string }>;
  /** Historique des « Mettre à jour », le plus récent d'abord. */
  changes: EstablishmentChange[];
  /** Champs obligatoires de la catégorie encore vides (fiches créées avant les catégories). */
  missing: string[];
  can: {
    edit: boolean;
    /** Changer le type ou la direction régionale. */
    editStructure: boolean;
    archive: boolean;
  };
}

/** Valeur d'un champ de la fiche, qu'il soit une colonne ou dans `details`. */
export function establishmentValue(
  item: OrganizationListItem,
  key: string,
): EstablishmentValue | null | undefined {
  if (key === 'direction') return item.direction?.name ?? null;
  if ((ESTABLISHMENT_COLUMN_KEYS as readonly string[]).includes(key)) {
    return item[key as keyof OrganizationListItem] as EstablishmentValue | null;
  }
  return item.details[key];
}
