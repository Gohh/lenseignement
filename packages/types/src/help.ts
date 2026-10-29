import { z } from 'zod';

/** Aide et tutorat : l'apprenant pose une question, son enseignant ou répétiteur répond. */

export const HELP_KINDS = ['not_understood', 'stuck', 'other'] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

export const HELP_KIND_LABELS: Record<HelpKind, string> = {
  not_understood: 'Je ne comprends pas',
  stuck: 'Je suis bloqué',
  other: 'Autre',
};

export const AskHelpSchema = z.object({
  kind: z.enum(HELP_KINDS),
  body: z.string().trim().min(3, 'Écris ta question en quelques mots.').max(2000),
  courseId: z.uuid().optional(),
  lessonNumber: z.number().int().min(1).max(10_000).optional(),
});
export type AskHelp = z.infer<typeof AskHelpSchema>;

export const AnswerHelpSchema = z.object({
  answer: z.string().trim().min(1, 'Écris ta réponse.').max(2000),
});

export const HELP_ATTACHMENT_KINDS = ['photo', 'audio'] as const;
export type HelpAttachmentKind = (typeof HELP_ATTACHMENT_KINDS)[number];

/** Formats acceptés et poids maximal (en octets) des pièces jointes d'une question. */
export const HELP_ATTACHMENT_RULES = {
  photo: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 3 * 1024 * 1024 },
  audio: {
    mimes: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'],
    maxBytes: 2 * 1024 * 1024,
  },
} as const;

export interface HelpAttachment {
  id: string;
  kind: HelpAttachmentKind;
}

export interface HelpQuestion {
  id: string;
  kind: HelpKind;
  body: string;
  courseId: string | null;
  courseTitle: string | null;
  lessonNumber: number | null;
  status: 'open' | 'answered';
  answer: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
  createdAt: string;
  /** Réponse pas encore vue par l'apprenant. */
  unseen: boolean;
  /** Photo et message vocal joints à la question. */
  attachments: HelpAttachment[];
}

/** Question vue par la personne qui répond : on ajoute le nom de l'élève. */
export interface HelpInboxItem extends HelpQuestion {
  learnerName: string;
}

export interface HelpBadge {
  /** Réponses reçues pas encore lues (côté apprenant). */
  answers: number;
  /** Questions en attente dans mon périmètre (côté enseignant ou répétiteur). */
  questions: number;
  /** Devoirs donnés à ma classe que je n'ai pas encore rendus (apprenant). */
  homework: number;
  /** Copies rendues qui attendent ma correction (enseignant). */
  toGrade: number;
  /** Séances de classe virtuelle en cours ou dans les 24 heures. */
  sessions: number;
  /** Messages de parents ou d'enseignants pas encore lus. */
  messages: number;
}
