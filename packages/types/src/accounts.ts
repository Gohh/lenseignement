import { z } from 'zod';

/**
 * Comptes et journal des actions (administration). Les comptes : superadministrateur et
 * administrateur ; le journal : superadministrateur seulement.
 */

export interface AccountListItem {
  id: string;
  displayName: string | null;
  /** Profils choisis à l'inscription (apprenant, parent, répétiteur). */
  profiles: string[];
  /** Rôles d'équipe actifs, avec leur structure. */
  roles: Array<{ role: string; organization: string }>;
  status: 'active' | 'suspended';
  createdAt: string;
  lastSeenAt: string | null;
}

export interface AccountList {
  items: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Seul le superadministrateur voit le journal des actions. */
  canSeeJournal: boolean;
}

export const AccountQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  role: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const SetAccountStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });

export interface AuditLogItem {
  id: string;
  occurredAt: string;
  actorName: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  decision: 'allow' | 'deny';
  reason: string;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  page: number;
  hasMore: boolean;
}

export const AuditQuerySchema = z.object({
  /** Domaine : début de l'action (« cohort », « team »…). */
  domain: z
    .string()
    .regex(/^[a-z-]{1,30}$/)
    .optional(),
  decision: z.enum(['allow', 'deny']).optional(),
  actor: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

/** Domaines du journal, en clair. */
export const AUDIT_DOMAIN_LABELS: Record<string, string> = {
  team: 'Équipe',
  organization: 'Établissements',
  cohort: 'Classes',
  learner: 'Élèves',
  level: 'Niveaux',
  assignment: 'Devoirs',
  evaluation: 'Évaluations',
  'class-session': 'Classe virtuelle',
  resource: 'Bibliothèque',
  course: 'Cours',
  curriculum: 'Programmes',
  family: 'Famille',
  remediation: 'Rattrapage',
  stats: 'Statistiques',
  account: 'Comptes',
};

/** Actions du journal, en clair ; une action inconnue s'affiche telle quelle. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'account.suspend': 'Compte suspendu',
  'account.reactivate': 'Compte réactivé',
  'assignment.create': 'Devoir donné',
  'assignment.delete': 'Devoir supprimé',
  'assignment.grade': 'Copie corrigée',
  'class-session.create': 'Séance programmée',
  'class-session.delete': 'Séance supprimée',
  'cohort.code.renew': 'Code de classe renouvelé',
  'cohort.create': 'Classe créée',
  'cohort.join': 'Élève entré dans une classe',
  'cohort.learner.remove': 'Élève retiré d’une classe',
  'cohort.learners.add': 'Élèves inscrits',
  'cohort.learners.transfer': 'Passage de classe',
  'cohort.read': 'Classe consultée',
  'cohort.teacher.add': 'Enseignant affecté',
  'cohort.teacher.remove': 'Enseignant retiré',
  'course.create': 'Cours créé',
  'curriculum.import': 'Programme importé (brouillon)',
  'curriculum.publish': 'Programme publié',
  'curriculum.draft.delete': 'Brouillon de programme supprimé',
  'evaluation.create': 'Évaluation créée',
  'evaluation.delete': 'Évaluation supprimée',
  'evaluation.scores': 'Notes saisies',
  'family.child.create': 'Enfant ajouté',
  'family.invitation.create': 'Invitation familiale créée',
  'family.invitation.redeem': 'Invitation familiale utilisée',
  'family.tutor.revoke': 'Répétiteur retiré',
  'learner.promotion.approve': 'Passage au niveau supérieur accepté',
  'learner.promotion.decline': 'Passage au niveau supérieur refusé',
  'learner.promotion.read': 'Demande de passage consultée',
  'learner.read': 'Fiche d’élève consultée',
  'level.approve': 'Niveau accepté',
  'level.decline': 'Niveau refusé',
  'level.promote': 'Niveau supérieur donné',
  'level.request': 'Niveau demandé',
  'organization.create': 'Établissement créé',
  'organization.update': 'Établissement modifié',
  'remediation.override': 'Rattrapage modifié',
  'remediation.read': 'Rattrapage consulté',
  'resource.add': 'Ressource partagée',
  'resource.remove': 'Ressource retirée',
  'stats.read': 'Statistiques consultées',
  'team.account.create': 'Compte créé',
  'team.invitation.create': 'Invitation d’équipe créée',
  'team.invitation.redeem': 'Invitation d’équipe utilisée',
  'team.member.remove': 'Rôle retiré',
  'team.member.update': 'Rôle modifié',
};
