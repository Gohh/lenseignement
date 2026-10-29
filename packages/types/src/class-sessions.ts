import { z } from 'zod';

/** Classe virtuelle : séances en visio programmées par l'enseignant pour une classe. */

export const CreateClassSessionSchema = z.object({
  title: z.string().trim().min(2, 'Donnez un titre à la séance.').max(120),
  subject: z.string().trim().max(60).optional(),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(240),
});

export const UpdateClassSessionSchema = z.object({
  summary: z.string().trim().max(2000).optional(),
  /** Lien vers un support (document, vidéo) ; vide pour l'enlever. */
  resourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === '' || /^https?:\/\//.test(v),
      'Le lien doit commencer par http:// ou https://',
    )
    .optional(),
});

export interface ClassSessionItem {
  id: string;
  cohortId: string;
  cohortName: string;
  title: string;
  subject: string | null;
  startsAt: string;
  endsAt: string;
  teacherName: string | null;
  /** Adresse du salon de visio. */
  joinUrl: string;
  summary: string | null;
  resourceUrl: string | null;
  /** L'enseignant ou la direction peut modifier ou annuler. */
  canManage: boolean;
}
