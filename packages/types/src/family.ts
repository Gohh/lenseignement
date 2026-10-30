import { z } from 'zod';
import { LevelCodeSchema } from './levels.js';

/** Ajout d'un enfant par son parent (ADR-020). */
export const CreateChildSchema = z.object({
  displayName: z.string().trim().min(2, 'Prénom trop court.').max(60, 'Prénom trop long.'),
  level: LevelCodeSchema.optional(),
});
export type CreateChildInput = z.infer<typeof CreateChildSchema>;

export const CreateInvitationSchema = z.object({
  learnerIds: z.array(z.string().uuid()).min(1, 'Choisissez au moins un enfant.').max(10),
});

/** Code parent remis par l'école avec les identifiants de l'élève. */
export const LinkParentCodeSchema = z.object({
  code: z.string().trim().min(4, 'Code parent trop court.').max(20, 'Code parent trop long.'),
});

export const RedeemInvitationSchema = z.object({
  code: z.string().trim().min(4).max(20),
});

export interface FamilyChild {
  id: string;
  displayName: string | null;
  level: string | null;
  /** Classes où l'école l'a inscrit, avec l'établissement (vide pour un profil créé par le parent). */
  classes: Array<{ name: string; organization: string; schoolYear: string }>;
  /** Répétiteurs ayant accès à cet enfant. */
  tutors: Array<{ linkId: string; tutorName: string | null }>;
}

export interface TutoredChild {
  id: string;
  displayName: string | null;
  level: string | null;
}
