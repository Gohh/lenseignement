import { z } from 'zod';

/** Bibliothèque : ressources (liens, documents, vidéos) partagées par l'enseignant avec une classe. */

export const RESOURCE_KINDS = [
  { code: 'lien', label: 'Lien' },
  { code: 'document', label: 'Document' },
  { code: 'video', label: 'Vidéo' },
  { code: 'exercice', label: 'Exercices' },
] as const;

export const AddResourceSchema = z.object({
  title: z.string().trim().min(2, 'Donnez un titre à la ressource.').max(120),
  description: z.string().trim().max(1000).optional(),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => /^https?:\/\//.test(v), 'Le lien doit commencer par http:// ou https://'),
  kind: z.enum(['lien', 'document', 'video', 'exercice']).default('lien'),
});

export interface ResourceItem {
  id: string;
  cohortId: string;
  cohortName: string;
  title: string;
  description: string | null;
  url: string;
  kind: 'lien' | 'document' | 'video' | 'exercice';
  addedAt: string;
  teacherName: string | null;
  /** L'enseignant ou la direction peut retirer. */
  canManage: boolean;
}
