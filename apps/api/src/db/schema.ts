import { sql } from 'drizzle-orm';
import { BRANCH_CODES, LEVEL_CODES } from '@lenseignement/types';
import {
  boolean,
  check,
  date,
  integer,
  index,
  jsonb,
  uniqueIndex,
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
    /** Cycles (espaces) accordés ; null = tous les cycles de la structure (ADR-019). */
    branches: text('branches').array(),
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
    check(
      'memberships_branches_check',
      sql`${t.branches} is null or ${t.branches} <@ array[${sql.raw(BRANCH_CODES.map((c) => `'${c}'`).join(','))}]::text[]`,
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

// --- Référentiels (programmes) versionnés : cahier §6.2, ADR-004 ---------------------------

/** Texte de référence d'une version de programme. Les sources de démonstration ne sont pas officielles. */
export const policySources = pgTable('policy_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  issuer: text('issuer').notNull(),
  url: text('url'),
  publishedOn: date('published_on'),
  isOfficial: boolean('is_official').notNull().default(false),
  createdAt: createdAt(),
});

export const curricula = pgTable('curricula', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  branch: text('branch').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdAt: createdAt(),
});

export const CURRICULUM_VERSION_STATUSES = ['draft', 'published'] as const;

/**
 * Version d'un programme. Un brouillon est modifiable ; une fois publiée, une version est figée
 * (déclencheurs PostgreSQL) et seule sa date de fin peut être renseignée, une seule fois,
 * quand la version suivante entre en vigueur.
 */
export const curriculumVersions = pgTable(
  'curriculum_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    curriculumId: uuid('curriculum_id')
      .notNull()
      .references(() => curricula.id),
    label: text('label').notNull(),
    status: text('status', { enum: CURRICULUM_VERSION_STATUSES }).notNull().default('draft'),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    policySourceId: uuid('policy_source_id').references(() => policySources.id),
    notes: text('notes'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('curriculum_versions_label_unique').on(t.curriculumId, t.label),
    check('curriculum_versions_status_check', sql`${t.status} in ('draft','published')`),
    check(
      'curriculum_versions_published_dated',
      sql`${t.status} = 'draft' or (${t.effectiveFrom} is not null and ${t.publishedAt} is not null)`,
    ),
    check(
      'curriculum_versions_period_check',
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
);

const versionId = () =>
  uuid('version_id')
    .notNull()
    .references(() => curriculumVersions.id);

export const levels = pgTable(
  'levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: versionId(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [unique('levels_version_code_unique').on(t.versionId, t.code)],
);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: versionId(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [unique('subjects_version_code_unique').on(t.versionId, t.code)],
);

/** Compétence d'une version. Son `code` est stable d'une version à l'autre. */
export const competencies = pgTable(
  'competencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: versionId(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    levelId: uuid('level_id').references(() => levels.id),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    position: integer('position').notNull(),
  },
  (t) => [unique('competencies_version_code_unique').on(t.versionId, t.code)],
);

/** Prérequis : `prerequisiteId` doit être acquise avant `competencyId` (même version). */
export const competencyEdges = pgTable(
  'competency_edges',
  {
    versionId: versionId(),
    prerequisiteId: uuid('prerequisite_id')
      .notNull()
      .references(() => competencies.id),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id),
  },
  (t) => [
    primaryKey({ columns: [t.prerequisiteId, t.competencyId] }),
    check('competency_edges_not_self', sql`${t.prerequisiteId} <> ${t.competencyId}`),
  ],
);

// --- Cours versionnés : cahier §6.2 (Catalogue), §7 ; ADR-005 --------------------------------

/** Cours rattaché à l'établissement qui en est responsable. Son contenu vit dans ses versions. */
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    branch: text('branch').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('courses_organization_idx').on(t.organizationId)],
);

export const COURSE_VERSION_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'archived',
] as const;

/**
 * Version numérotée d'un cours. Seul un brouillon (`draft`) est modifiable, et un cours n'a
 * qu'un brouillon à la fois. `revision` augmente à chaque modification (concurrence optimiste).
 */
export const courseVersions = pgTable(
  'course_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    number: integer('number').notNull(),
    status: text('status', { enum: COURSE_VERSION_STATUSES }).notNull().default('draft'),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    audience: text('audience').notNull().default(''),
    language: text('language').notNull().default('fr'),
    licence: text('licence').notNull().default('Tous droits réservés'),
    estimatedMinutes: integer('estimated_minutes'),
    /** Niveau ou classe visé (types `LEVEL_CODES`), null : tous niveaux de l'espace. */
    level: text('level'),
    /** Version exacte du programme de référence (cahier §6.1). */
    curriculumVersionId: uuid('curriculum_version_id').references(() => curriculumVersions.id),
    revision: integer('revision').notNull().default(1),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    /** Circuit de validation (ADR-006) : trois personnes distinctes de l'auteur au publieur. */
    submittedBy: uuid('submitted_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    publishedBy: uuid('published_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('course_versions_number_unique').on(t.courseId, t.number),
    // Une seule version en cours de travail (brouillon, relecture ou approuvée) et une seule publiée.
    uniqueIndex('course_versions_one_open')
      .on(t.courseId)
      .where(sql`${t.status} in ('draft','in_review','approved')`),
    uniqueIndex('course_versions_one_published')
      .on(t.courseId)
      .where(sql`${t.status} = 'published'`),
    check(
      'course_versions_status_check',
      sql`${t.status} in ('draft','in_review','approved','published','archived')`,
    ),
    check(
      'course_versions_level_check',
      sql`${t.level} is null or ${t.level} in (${sql.raw(LEVEL_CODES.map((c) => `'${c}'`).join(','))})`,
    ),
    index('course_versions_level_idx').on(t.level),
  ],
);

export const courseVersionCompetencies = pgTable(
  'course_version_competencies',
  {
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersions.id),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id),
  },
  (t) => [primaryKey({ columns: [t.courseVersionId, t.competencyId] })],
);

export const courseModules = pgTable(
  'course_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersions.id),
    title: text('title').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [index('course_modules_version_idx').on(t.courseVersionId)],
);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Redondant avec le module, pour que la règle d'immuabilité s'applique directement. */
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersions.id),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => courseModules.id),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    estimatedMinutes: integer('estimated_minutes'),
    position: integer('position').notNull(),
  },
  (t) => [index('lessons_module_idx').on(t.moduleId)],
);

export const REVIEW_ACTIONS = [
  'submitted',
  'changes_requested',
  'approved',
  'published',
  'replaced',
  'withdrawn',
] as const;

/**
 * Historique du circuit de validation d'une version (ADR-006). Ajout seulement : un déclencheur
 * refuse toute modification ou suppression.
 */
export const courseReviewEvents = pgTable(
  'course_review_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersions.id),
    action: text('action', { enum: REVIEW_ACTIONS }).notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    comment: text('comment').notNull().default(''),
    /** Contrôles cochés à l'approbation (pédagogie, accessibilité, droits). */
    checklist: jsonb('checklist').$type<Record<string, boolean>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('course_review_events_version_idx').on(t.courseVersionId),
    check(
      'course_review_events_action_check',
      sql`${t.action} in ('submitted','changes_requested','approved','published','replaced','withdrawn')`,
    ),
  ],
);

/**
 * Inscription d'une personne à un cours (cahier §6.2, ticket 12). Une seule par personne et par
 * cours ; elle suit le cours, quelle que soit sa version publiée.
 */
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    status: text('status').notNull().default('active'),
    /** Dernière leçon ouverte (rang dans le plan), pour le bouton « Reprendre ». */
    lastLessonNumber: integer('last_lesson_number'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('enrollments_user_course_unique').on(t.userId, t.courseId),
    check('enrollments_status_check', sql`${t.status} in ('active')`),
  ],
);

/**
 * Leçons terminées. Progression monotone (cahier §5.4) : une leçon terminée le reste, et un
 * double envoi n'ajoute rien. La version du cours lue est conservée pour la traçabilité.
 */
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id),
    lessonNumber: integer('lesson_number').notNull(),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersions.id),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('lesson_progress_unique').on(t.enrollmentId, t.lessonNumber),
    check('lesson_progress_number_check', sql`${t.lessonNumber} >= 1`),
  ],
);

/**
 * Questions de quiz formatif d'une leçon (ticket 13, ADR-010). Rattachées à la version du cours,
 * donc figées avec elle hors brouillon (même déclencheur que les leçons).
 */
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersions.id),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    position: integer('position').notNull(),
    prompt: text('prompt').notNull(),
    choices: jsonb('choices').$type<string[]>().notNull(),
    correctChoice: integer('correct_choice').notNull(),
    explanation: text('explanation').notNull().default(''),
  },
  (t) => [
    index('quiz_questions_lesson_idx').on(t.lessonId),
    check(
      'quiz_questions_choices_check',
      sql`jsonb_typeof(${t.choices}) = 'array' and jsonb_array_length(${t.choices}) between 2 and 4`,
    ),
    check(
      'quiz_questions_correct_check',
      sql`${t.correctChoice} >= 0 and ${t.correctChoice} < jsonb_array_length(${t.choices})`,
    ),
  ],
);

/**
 * Tentatives de quiz d'une personne inscrite. Ajout seulement ; l'identifiant vient de l'appareil
 * pour qu'un renvoi ne crée pas de doublon. La version exacte du cours est conservée (cahier §6.1).
 */
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersions.id),
    lessonNumber: integer('lesson_number').notNull(),
    score: integer('score').notNull(),
    total: integer('total').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('quiz_attempts_user_lesson_idx').on(t.userId, t.courseId, t.lessonNumber),
    check('quiz_attempts_score_check', sql`${t.score} >= 0 and ${t.score} <= ${t.total}`),
    check('quiz_attempts_number_check', sql`${t.lessonNumber} >= 1`),
  ],
);

export const quizResponses = pgTable(
  'quiz_responses',
  {
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => quizAttempts.id),
    questionId: uuid('question_id')
      .notNull()
      .references(() => quizQuestions.id),
    choice: integer('choice').notNull(),
    correct: boolean('correct').notNull(),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.questionId] })],
);

export const LEARNING_EVENT_TYPES = [
  'enrolled',
  'lesson_opened',
  'lesson_completed',
  'quiz_submitted',
] as const;

/**
 * Journal des actions envoyées par l'appareil de l'apprenant (cahier §6.4, ticket 14, ADR-011).
 * Chaque action porte un identifiant choisi par l'appareil : un renvoi est reconnu et n'est pas
 * rejoué. Ajout seulement.
 */
export const learningEvents = pgTable(
  'learning_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id),
    eventType: text('event_type', { enum: LEARNING_EVENT_TYPES }).notNull(),
    clientOperationId: uuid('client_operation_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    /** Heure de l'action sur l'appareil (peut précéder la réception, hors ligne). */
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('learning_events_operation_unique').on(t.userId, t.clientOperationId),
    index('learning_events_user_course_time_idx').on(t.userId, t.courseId, t.createdAt),
    check(
      'learning_events_type_check',
      sql`${t.eventType} in ('enrolled','lesson_opened','lesson_completed','quiz_submitted')`,
    ),
  ],
);

export const OUTBOX_EVENT_TYPES = [
  'EnrollmentCreated',
  'LessonCompleted',
  'AssessmentSubmitted',
] as const;
export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

/**
 * Outbox transactionnelle (cahier §5.3) : un évènement métier est écrit dans la même transaction
 * que le changement, puis délivré par un travailleur. Contenu minimal : identifiants seulement.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type', { enum: OUTBOX_EVENT_TYPES }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    /** Prochaine tentative de livraison (reculée après un échec). */
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('outbox_events_pending_idx')
      .on(t.availableAt)
      .where(sql`${t.publishedAt} is null`),
    check(
      'outbox_events_type_check',
      sql`${t.eventType} in ('EnrollmentCreated','LessonCompleted','AssessmentSubmitted')`,
    ),
  ],
);

// --- Bilan et rattrapage : cahier §6.4 (PNAPAS / remédiation), §7 ; ticket 17, ADR-013 --------

/**
 * Bilan diagnostique rattaché à une version de programme. Ses questions visent chacune une
 * compétence de cette version : un résultat se relit toujours avec la version utilisée (E2E-04).
 */
export const diagnostics = pgTable('diagnostics', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  curriculumVersionId: uuid('curriculum_version_id')
    .notNull()
    .references(() => curriculumVersions.id),
  createdAt: createdAt(),
});

export const DIAGNOSTIC_PHASES = ['diagnostic', 'post_test'] as const;

/** Question du bilan (`diagnostic`) ou du petit test de vérification (`post_test`). Figée. */
export const diagnosticItems = pgTable(
  'diagnostic_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    diagnosticId: uuid('diagnostic_id')
      .notNull()
      .references(() => diagnostics.id),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id),
    phase: text('phase', { enum: DIAGNOSTIC_PHASES }).notNull(),
    position: integer('position').notNull(),
    prompt: text('prompt').notNull(),
    choices: jsonb('choices').$type<string[]>().notNull(),
    correctChoice: integer('correct_choice').notNull(),
    explanation: text('explanation').notNull().default(''),
  },
  (t) => [
    unique('diagnostic_items_position_unique').on(t.diagnosticId, t.phase, t.position),
    check('diagnostic_items_phase_check', sql`${t.phase} in ('diagnostic','post_test')`),
    check(
      'diagnostic_items_choices_check',
      sql`jsonb_typeof(${t.choices}) = 'array' and jsonb_array_length(${t.choices}) between 2 and 4`,
    ),
    check(
      'diagnostic_items_correct_check',
      sql`${t.correctChoice} >= 0 and ${t.correctChoice} < jsonb_array_length(${t.choices})`,
    ),
  ],
);

export const REMEDIATION_STATUSES = ['active', 'completed', 'replaced'] as const;
export const REMEDIATION_SOURCES = ['rule', 'teacher'] as const;

/**
 * Plan de rattrapage : la compétence à travailler, le cours conseillé et l'explication donnée.
 * Une seule orientation en cours par apprenant ; une correction de l'enseignant crée un nouveau
 * plan et clôt l'ancien (`replaced`), pour garder la trace des deux.
 */
export const remediationPlans = pgTable(
  'remediation_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    diagnosticId: uuid('diagnostic_id')
      .notNull()
      .references(() => diagnostics.id),
    /** Bilan d'où vient la proposition. */
    diagnosticSessionId: uuid('diagnostic_session_id')
      .notNull()
      .references((): AnyPgColumn => diagnosticSessions.id),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id),
    courseId: uuid('course_id').references(() => courses.id),
    rationale: jsonb('rationale').$type<string[]>().notNull(),
    source: text('source', { enum: REMEDIATION_SOURCES }).notNull(),
    decidedBy: uuid('decided_by').references(() => users.id),
    reason: text('reason'),
    status: text('status', { enum: REMEDIATION_STATUSES }).notNull().default('active'),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('remediation_plans_one_active')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    check('remediation_plans_status_check', sql`${t.status} in ('active','completed','replaced')`),
    check('remediation_plans_source_check', sql`${t.source} in ('rule','teacher')`),
    check(
      'remediation_plans_teacher_check',
      sql`${t.source} = 'rule' or (${t.decidedBy} is not null and ${t.reason} is not null)`,
    ),
  ],
);

/**
 * Bilan ou petit test passé par un apprenant. Ajout seulement ; l'identifiant vient de l'appareil
 * pour qu'un renvoi ne crée pas de doublon. Un petit test est rattaché au plan qu'il vérifie.
 */
export const diagnosticSessions = pgTable(
  'diagnostic_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    diagnosticId: uuid('diagnostic_id')
      .notNull()
      .references(() => diagnostics.id),
    phase: text('phase', { enum: DIAGNOSTIC_PHASES }).notNull(),
    planId: uuid('plan_id').references(() => remediationPlans.id),
    score: integer('score').notNull(),
    total: integer('total').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('diagnostic_sessions_user_idx').on(t.userId, t.submittedAt),
    check('diagnostic_sessions_phase_check', sql`${t.phase} in ('diagnostic','post_test')`),
    check(
      'diagnostic_sessions_plan_check',
      sql`(${t.phase} = 'post_test') = (${t.planId} is not null)`,
    ),
    check('diagnostic_sessions_score_check', sql`${t.score} >= 0 and ${t.score} <= ${t.total}`),
  ],
);

export const diagnosticResponses = pgTable(
  'diagnostic_responses',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => diagnosticSessions.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => diagnosticItems.id),
    choice: integer('choice').notNull(),
    correct: boolean('correct').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.itemId] })],
);

/** Résultat par compétence d'un bilan ou d'un petit test (cahier : `skill_gaps`). */
export const skillResults = pgTable(
  'skill_results',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => diagnosticSessions.id),
    competencyId: uuid('competency_id')
      .notNull()
      .references(() => competencies.id),
    correct: integer('correct').notNull(),
    total: integer('total').notNull(),
    mastered: boolean('mastered').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.competencyId] })],
);

/** Étape de simulation avec son corrigé (jamais envoyé au navigateur). */
export type SimulationStepDef =
  | {
      kind: 'identify';
      id: string;
      title: string;
      instructions: string;
      questions: Array<{ prompt: string; choices: string[]; correct: number; explanation: string }>;
    }
  | {
      kind: 'equipment';
      id: string;
      title: string;
      instructions: string;
      options: string[];
      /** Numéros des équipements à prendre ; les autres sont à laisser. */
      required: number[];
      /** Explication pour chaque équipement (prendre ou laisser), dans l'ordre affiché. */
      explanations: string[];
    }
  | {
      kind: 'order';
      id: string;
      title: string;
      instructions: string;
      /** Gestes dans l'ordre d'affichage. */
      gestures: string[];
      /** Numéros des gestes, du premier au dernier. */
      correctOrder: number[];
      /** Pour chaque geste (ordre d'affichage), pourquoi il vient à sa place. */
      explanations: string[];
    };

/**
 * Simulation de sécurité d'atelier (ticket 18, ADR-014) : rattachée à la version exacte du
 * référentiel métier. Elle vérifie une compétence de sécurité et ouvre, réussie, la séance
 * pratique encadrée d'une autre compétence. Figée une fois créée.
 */
export const safetySimulations = pgTable('safety_simulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  curriculumVersionId: uuid('curriculum_version_id')
    .notNull()
    .references(() => curriculumVersions.id),
  competencyId: uuid('competency_id')
    .notNull()
    .references(() => competencies.id),
  practiceCompetencyId: uuid('practice_competency_id')
    .notNull()
    .references(() => competencies.id),
  steps: jsonb('steps').$type<SimulationStepDef[]>().notNull(),
  createdAt: createdAt(),
});

/** Essai de simulation : ajout seulement ; l'identifiant vient de l'appareil (pas de doublon). */
export const simulationAttempts = pgTable(
  'simulation_attempts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    simulationId: uuid('simulation_id')
      .notNull()
      .references(() => safetySimulations.id),
    passed: boolean('passed').notNull(),
    answers: jsonb('answers').$type<Array<{ stepId: string; choices: number[] }>>().notNull(),
    results: jsonb('results')
      .$type<Array<{ stepId: string; title: string; passed: boolean; feedback: string[] }>>()
      .notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('simulation_attempts_user_idx').on(t.userId, t.simulationId, t.submittedAt)],
);

/**
 * Demande de séance pratique encadrée. Permise seulement après un dernier essai réussi
 * (vérifié aussi par la base) ; une seule par apprenant et par simulation.
 */
export const practiceRequests = pgTable(
  'practice_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    simulationId: uuid('simulation_id')
      .notNull()
      .references(() => safetySimulations.id),
    /** Essai réussi qui a ouvert la séance. */
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => simulationAttempts.id),
    createdAt: createdAt(),
  },
  (t) => [unique('practice_requests_once').on(t.userId, t.simulationId)],
);
