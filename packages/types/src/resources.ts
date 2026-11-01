import { z } from 'zod';

/** Bibliothèque : livres (PDF, EPUB, images, audio, vidéo) et liens partagés avec une classe. */

export const RESOURCE_KINDS = [
  { code: 'lien', label: 'Lien' },
  { code: 'document', label: 'Document' },
  { code: 'video', label: 'Vidéo' },
  { code: 'exercice', label: 'Exercices' },
] as const;

/** Formats acceptés dans la bibliothèque. */
export const LIBRARY_FORMATS = [
  { code: 'pdf', label: 'PDF' },
  { code: 'epub', label: 'EPUB' },
  { code: 'images', label: 'Images' },
  { code: 'audio', label: 'Audio' },
  { code: 'video', label: 'Vidéo' },
  { code: 'lien', label: 'Lien' },
] as const;

export type LibraryFormat = (typeof LIBRARY_FORMATS)[number]['code'];

/** Types de fichiers acceptés pour chaque format, et poids maximal d'un fichier. */
export const LIBRARY_FILE_RULES: Record<
  Exclude<LibraryFormat, 'lien'>,
  { mimes: readonly string[]; extensions: readonly string[]; maxBytes: number; maxFiles: number }
> = {
  pdf: { mimes: ['application/pdf'], extensions: ['pdf'], maxBytes: 50 * 1024 * 1024, maxFiles: 1 },
  epub: {
    mimes: ['application/epub+zip'],
    extensions: ['epub'],
    maxBytes: 50 * 1024 * 1024,
    maxFiles: 1,
  },
  images: {
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 10 * 1024 * 1024,
    maxFiles: 60,
  },
  audio: {
    mimes: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm'],
    extensions: ['mp3', 'm4a', 'ogg', 'wav', 'weba'],
    maxBytes: 50 * 1024 * 1024,
    maxFiles: 1,
  },
  video: {
    mimes: ['video/mp4', 'video/webm'],
    extensions: ['mp4', 'webm'],
    maxBytes: 50 * 1024 * 1024,
    maxFiles: 1,
  },
};

/** Couverture d'un livre : une petite image. */
export const LIBRARY_COVER_RULES = {
  mimes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 1024 * 1024,
} as const;

/** Couleurs de couverture proposées (le texte de la couverture reste lisible sur chacune). */
export const LIBRARY_COVER_COLORS = [
  '#146b46',
  '#e97824',
  '#215c9a',
  '#7b3f8c',
  '#a52a32',
  '#c9a227',
  '#2a7f8f',
  '#0e4f33',
] as const;

export const AddResourceSchema = z
  .object({
    title: z.string().trim().min(2, 'Donnez un titre au livre.').max(120),
    description: z.string().trim().max(1000).optional(),
    url: z
      .string()
      .trim()
      .max(500)
      .refine(
        (v) => v === '' || /^https?:\/\//.test(v),
        'Le lien doit commencer par http:// ou https://',
      )
      .optional(),
    kind: z.enum(['lien', 'document', 'video', 'exercice']).default('lien'),
    format: z.enum(['lien', 'pdf', 'epub', 'images', 'audio', 'video']).default('lien'),
    shelf: z.string().trim().max(60).optional(),
    author: z.string().trim().max(120).optional(),
    coverColor: z.enum(LIBRARY_COVER_COLORS).optional(),
    offlineAllowed: z.boolean().default(true),
  })
  .refine((v) => v.format !== 'lien' || (v.url ?? '') !== '', {
    message: 'Donnez le lien internet (il commence par https://).',
    path: ['url'],
  });

export type AddResourceInput = z.infer<typeof AddResourceSchema>;

export interface LibraryFileItem {
  id: string;
  mime: string;
  sizeBytes: number;
}

export interface ResourceItem {
  id: string;
  cohortId: string;
  cohortName: string;
  title: string;
  description: string | null;
  /** Adresse internet (format « lien » seulement). */
  url: string | null;
  kind: 'lien' | 'document' | 'video' | 'exercice';
  format: LibraryFormat;
  shelf: string;
  author: string | null;
  coverColor: string;
  /** Image de couverture envoyée, sinon la couleur. */
  coverFileId: string | null;
  /** Fichiers du livre, dans l'ordre (plusieurs pour un album d'images). */
  files: LibraryFileItem[];
  offlineAllowed: boolean;
  addedAt: string;
  teacherName: string | null;
  /** L'enseignant ou la direction peut retirer. */
  canManage: boolean;
}
