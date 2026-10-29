import { z } from 'zod';

/** Messages entre un parent (ou tuteur) et l'enseignant de son enfant. */

export const StartConversationSchema = z.object({
  /** L'enfant dont il est question. */
  learnerId: z.uuid(),
  /** L'autre personne : l'enseignant (si j'écris en tant que parent) ou le parent. */
  otherUserId: z.uuid(),
  body: z.string().trim().min(1, 'Écrivez votre message.').max(4000),
});

export const SendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Écrivez votre message.').max(4000),
});

export interface MessageContact {
  learnerId: string;
  learnerName: string;
  otherUserId: string;
  otherName: string;
  /** Rôle de l'autre personne dans l'échange. */
  otherRole: 'enseignant' | 'parent';
}

export interface ConversationItem {
  id: string;
  learnerName: string;
  otherName: string;
  otherRole: 'enseignant' | 'parent';
  lastMessage: string;
  lastAt: string;
  unread: number;
}

export interface ChatMessage {
  id: string;
  body: string;
  sentAt: string;
  mine: boolean;
  senderName: string;
}

export interface ConversationView {
  conversation: Omit<ConversationItem, 'lastMessage' | 'lastAt' | 'unread'>;
  messages: ChatMessage[];
}
