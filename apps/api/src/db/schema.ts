import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * Schéma PostgreSQL du noyau (cahier §6). Toute modification passe par une migration générée
 * (`pnpm --filter @lenseignement/api db:generate`) puis relue avant d'être commitée.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const ORGANIZATION_TYPES = [
  'school',
  'technical_center',
  'literacy_center',
  'authority',
  'partner',
] as const;

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: text('type', { enum: ORGANIZATION_TYPES }).notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => organizations.id),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'organizations_type_check',
      sql`${t.type} in ('school','technical_center','literacy_center','authority','partner')`,
    ),
  ],
);

export const ACCOUNT_TYPES = ['minor', 'adult', 'staff', 'unknown'] as const;

/** Compte applicatif lié à l'identité OIDC. Aucune donnée sensible ici (cahier §6.4). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oidcSubject: text('oidc_subject').notNull().unique(),
    accountType: text('account_type', { enum: ACCOUNT_TYPES }).notNull().default('unknown'),
    /** Nom d'usage affiché aux personnes autorisées (enseignant, parent). */
    displayName: text('display_name'),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    check('users_account_type_check', sql`${t.accountType} in ('minor','adult','staff','unknown')`),
    check('users_status_check', sql`${t.status} in ('active','suspended')`),
  ],
);

export const MEMBERSHIP_ROLES = [
  'chef-etablissement',
  'enseignant',
  'apprenant',
  'alphabetiseur',
  'referent-pedagogique',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Rattachement d'une personne à une structure, avec un rôle local et une éventuelle fin. */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: text('role', { enum: MEMBERSHIP_ROLES }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('memberships_user_org_role_unique').on(t.userId, t.organizationId, t.role),
    index('memberships_user_idx').on(t.userId),
    check(
      'memberships_role_check',
      sql`${t.role} in ('chef-etablissement','enseignant','apprenant','alphabetiseur','referent-pedagogique')`,
    ),
  ],
);

/** Classe ou groupe d'apprentissage d'une structure, pour une année scolaire. */
export const cohorts = pgTable(
  'cohorts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    schoolYear: text('school_year').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('cohorts_org_code_year_unique').on(t.organizationId, t.code, t.schoolYear)],
);

export const COHORT_MEMBER_ROLES = ['enseignant', 'apprenant'] as const;

export const cohortMembers = pgTable(
  'cohort_members',
  {
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => cohorts.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: COHORT_MEMBER_ROLES }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.cohortId, t.userId, t.role] }),
    index('cohort_members_user_idx').on(t.userId),
    check('cohort_members_role_check', sql`${t.role} in ('enseignant','apprenant')`),
  ],
);

export const GUARDIAN_LINK_STATUSES = ['pending', 'verified', 'revoked'] as const;

/** Lien parent ou tuteur légal → apprenant. Seul un lien vérifié et non révoqué ouvre un accès. */
export const guardianLinks = pgTable(
  'guardian_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => users.id),
    learnerUserId: uuid('learner_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: GUARDIAN_LINK_STATUSES }).notNull().default('pending'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('guardian_links_pair_unique').on(t.guardianUserId, t.learnerUserId),
    index('guardian_links_guardian_idx').on(t.guardianUserId),
    check('guardian_links_status_check', sql`${t.status} in ('pending','verified','revoked')`),
    check('guardian_links_not_self', sql`${t.guardianUserId} <> ${t.learnerUserId}`),
  ],
);

/** Journal des décisions d'accès aux données d'apprenants (cahier §8.2.6). Sans contenu personnel. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    decision: text('decision', { enum: ['allow', 'deny'] }).notNull(),
    reason: text('reason').notNull(),
    traceId: text('trace_id'),
  },
  (t) => [
    index('audit_logs_occurred_idx').on(t.occurredAt),
    index('audit_logs_actor_idx').on(t.actorUserId),
    check('audit_logs_decision_check', sql`${t.decision} in ('allow','deny')`),
  ],
);
