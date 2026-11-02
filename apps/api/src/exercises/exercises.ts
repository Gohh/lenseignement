import {
  EXERCISE_DOMAINS,
  EXERCISE_STATUSES,
  ExerciseImportItemSchema,
  exercisePlay,
  gradeExercise,
  type CreateExerciseInput,
  type ExerciseAnswer,
  type ExerciseCompetencyOption,
  type ExerciseContent,
  type ExerciseDetail,
  type ExerciseDifficulty,
  type ExerciseDomain,
  type ExerciseImportResult,
  type ExerciseKind,
  type ExerciseResult,
  type ExerciseSkill,
  type ExerciseStatus,
  type ExerciseSummary,
  type UpdateExerciseInput,
} from '@lenseignement/types';
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  AUTHOR_ROLES,
  PUBLISHER_ROLES,
  organizationIdsWithRoles,
} from '../access/access.service.js';
import type { Database, Executor } from '../db/database.js';
import {
  auditLogs,
  competencies,
  curricula,
  curriculumVersions,
  exerciseMedia,
  exercises,
  levels,
  organizations,
  subjects,
  users,
} from '../db/schema.js';

/**
 * Fabrique d'exercices (étape 2 du plan validé par GOHH le 02/11/2026). Les auteurs rédigent pour
 * leur structure ; la direction, le référent ou le conseiller pédagogique relit et publie (jamais
 * son propre exercice, sauf le superadministrateur). Publiés, les exercices forment une banque
 * commune que tous les auteurs consultent et réutilisent.
 */

export class ExerciseError extends Error {
  constructor(
    readonly kind: 'invalid' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

const NOT_FOUND = 'Exercice introuvable.';

export const EXERCISE_AUTHOR_ROLES = [...AUTHOR_ROLES, 'conseiller-pedagogique'] as const;
export const EXERCISE_PUBLISHER_ROLES = [...PUBLISHER_ROLES, 'conseiller-pedagogique'] as const;

function platformAdmin(userId: string): SQL {
  return sql`exists (
    select 1 from memberships m
     where m.user_id = ${userId} and m.role in ('superadministrateur', 'administrateur')
       and (m.valid_until is null or m.valid_until > now()))`;
}

function orgsWith(userId: string, roles: readonly string[]): SQL {
  return sql`(
    select a.id from ${organizationIdsWithRoles(userId, roles)} a
    union
    select o.id from organizations o where ${platformAdmin(userId)})`;
}

export interface Powers {
  authorOrgIds: Set<string>;
  publisherOrgIds: Set<string>;
  superadmin: boolean;
}

export async function powers(db: Executor, userId: string): Promise<Powers> {
  const [authors, publishers, superadmin] = await Promise.all([
    db.execute(sql`select id from ${orgsWith(userId, EXERCISE_AUTHOR_ROLES)} a`),
    db.execute(sql`select id from ${orgsWith(userId, EXERCISE_PUBLISHER_ROLES)} p`),
    db.execute(sql`
      select 1 from memberships
       where user_id = ${userId} and role = 'superadministrateur'
         and (valid_until is null or valid_until > now())`),
  ]);
  const ids = (rows: unknown[]) => new Set(rows.map((r) => (r as { id: string }).id));
  return {
    authorOrgIds: ids(authors.rows),
    publisherOrgIds: ids(publishers.rows),
    superadmin: superadmin.rows.length > 0,
  };
}

/** La personne peut rédiger ou relire des exercices quelque part (menu « Fabrique »). */
export async function isExerciseAuthor(db: Executor, userId: string): Promise<boolean> {
  const { rows } = await db.execute(
    sql`select 1 from ${orgsWith(userId, [...EXERCISE_AUTHOR_ROLES, ...EXERCISE_PUBLISHER_ROLES])} x limit 1`,
  );
  return rows.length > 0;
}

async function audit(db: Executor, userId: string, action: string, id: string, traceId?: string) {
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action,
    resourceType: 'exercise',
    resourceId: id,
    decision: 'allow',
    reason: 'fabrique',
    traceId,
  });
}

/** Structures pour lesquelles la personne peut créer un exercice. */
export async function listExerciseOrganizations(db: Database, userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      and(
        inArray(organizations.id, orgsWith(userId, EXERCISE_AUTHOR_ROLES)),
        sql`${organizations.archivedAt} is null`,
      ),
    )
    .orderBy(asc(organizations.name));
}

/** Compétences des programmes publiés, avec leur matière et leur niveau. */
export async function listExerciseCompetencies(db: Database): Promise<ExerciseCompetencyOption[]> {
  const rows = await db
    .select({
      id: competencies.id,
      code: competencies.code,
      title: competencies.title,
      subject: subjects.title,
      level: levels.title,
      curriculumTitle: curricula.title,
      label: curriculumVersions.label,
      versionId: curriculumVersions.id,
    })
    .from(competencies)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .innerJoin(subjects, eq(subjects.id, competencies.subjectId))
    .leftJoin(levels, eq(levels.id, competencies.levelId))
    .where(eq(curriculumVersions.status, 'published'))
    .orderBy(
      asc(curricula.title),
      asc(curriculumVersions.label),
      asc(subjects.position),
      asc(competencies.position),
    )
    .limit(2000);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    subject: r.subject,
    level: r.level,
    curriculum: `${r.curriculumTitle} (${r.label})`,
    curriculumId: r.versionId,
  }));
}

const reviewer = alias(users, 'reviewer');

const columns = {
  id: exercises.id,
  title: exercises.title,
  kind: exercises.kind,
  domain: exercises.domain,
  difficulty: exercises.difficulty,
  skill: exercises.skill,
  status: exercises.status,
  content: exercises.content,
  reviewNote: exercises.reviewNote,
  updatedAt: exercises.updatedAt,
  publishedAt: exercises.publishedAt,
  authorId: exercises.authorId,
  author: users.displayName,
  reviewer: reviewer.displayName,
  organization: { id: organizations.id, name: organizations.name },
  competency: {
    id: competencies.id,
    code: competencies.code,
    title: competencies.title,
    subject: subjects.title,
    curriculumTitle: curricula.title,
    label: curriculumVersions.label,
    versionId: curriculumVersions.id,
  },
  draftId: sql<string | null>`(
    select d.id from exercises d
     where d.replaces_id = ${exercises.id} and d.status in ('draft', 'review') limit 1)`,
};

type Row = {
  id: string;
  title: string;
  kind: string;
  domain: string;
  difficulty: string;
  skill: string;
  status: ExerciseStatus;
  content: ExerciseContent;
  reviewNote: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
  authorId: string | null;
  author: string | null;
  reviewer: string | null;
  organization: { id: string; name: string };
  competency: {
    id: string;
    code: string;
    title: string;
    subject: string;
    curriculumTitle: string;
    label: string;
    versionId: string;
  };
  draftId: string | null;
};

function query(db: Executor) {
  return db
    .select(columns)
    .from(exercises)
    .innerJoin(organizations, eq(organizations.id, exercises.organizationId))
    .innerJoin(competencies, eq(competencies.id, exercises.competencyId))
    .innerJoin(subjects, eq(subjects.id, competencies.subjectId))
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .leftJoin(users, eq(users.id, exercises.authorId))
    .leftJoin(reviewer, eq(reviewer.id, exercises.reviewedBy));
}

function toSummary(row: Row, userId: string, p: Powers): ExerciseSummary {
  const org = row.organization.id;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as ExerciseKind,
    domain: row.domain as ExerciseDomain,
    difficulty: row.difficulty as ExerciseDifficulty,
    skill: row.skill as ExerciseSkill,
    status: row.status,
    competency: {
      id: row.competency.id,
      code: row.competency.code,
      title: row.competency.title,
      subject: row.competency.subject,
      curriculum: `${row.competency.curriculumTitle} (${row.competency.label})`,
    },
    organization: row.organization,
    author: row.author,
    reviewer: row.reviewer,
    reviewNote: row.reviewNote,
    updatedAt: row.updatedAt.toISOString(),
    mine: p.authorOrgIds.has(org) || p.publisherOrgIds.has(org),
    canPublish:
      row.status === 'review' &&
      p.publisherOrgIds.has(org) &&
      (row.authorId !== userId || p.superadmin),
  };
}

export interface ExerciseFilters {
  scope: 'mine' | 'all';
  status?: ExerciseStatus;
  domain?: ExerciseDomain;
  curriculumId?: string;
  q?: string;
}

/**
 * Banque : les exercices des structures de la personne (tous états), et, avec « toute la banque »,
 * les exercices publiés de partout.
 */
export async function listExercises(
  db: Database,
  userId: string,
  filters: ExerciseFilters,
): Promise<{ items: ExerciseSummary[]; byDomain: Record<string, number> }> {
  const p = await powers(db, userId);
  const orgIds = [...new Set([...p.authorOrgIds, ...p.publisherOrgIds])];
  if (orgIds.length === 0) return { items: [], byDomain: {} };
  const visible =
    filters.scope === 'all'
      ? sql`(${inArray(exercises.organizationId, orgIds)} or ${exercises.status} = 'published')`
      : inArray(exercises.organizationId, orgIds);
  const conditions: SQL[] = [visible];
  if (filters.status && EXERCISE_STATUSES.includes(filters.status)) {
    conditions.push(eq(exercises.status, filters.status));
  }
  if (filters.curriculumId && /^[0-9a-f-]{36}$/i.test(filters.curriculumId)) {
    conditions.push(eq(curriculumVersions.id, filters.curriculumId));
  }
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim().replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(
      sql`(${exercises.title} ilike ${like} or ${competencies.title} ilike ${like} or ${competencies.code} ilike ${like})`,
    );
  }
  // Compteur par domaine : avec tous les filtres sauf celui du domaine.
  const counts = await db
    .select({ domain: exercises.domain, n: sql<number>`count(*)::int` })
    .from(exercises)
    .innerJoin(competencies, eq(competencies.id, exercises.competencyId))
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .where(and(...conditions))
    .groupBy(exercises.domain);
  if (filters.domain && EXERCISE_DOMAINS.includes(filters.domain)) {
    conditions.push(eq(exercises.domain, filters.domain));
  }
  const rows = (await query(db)
    .where(and(...conditions))
    .orderBy(
      sql`case ${exercises.status} when 'review' then 0 when 'draft' then 1 when 'published' then 2 else 3 end`,
      sql`${exercises.updatedAt} desc`,
    )
    .limit(300)) as Row[];
  return {
    items: rows.map((row) => toSummary(row, userId, p)),
    byDomain: Object.fromEntries(counts.map((c) => [c.domain, c.n])),
  };
}

async function load(db: Executor, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ExerciseError('not_found', NOT_FOUND);
  const [row] = (await query(db).where(eq(exercises.id, id))) as Row[];
  if (!row) throw new ExerciseError('not_found', NOT_FOUND);
  return row;
}

/** Visible : de ses structures, ou publié (banque commune). */
async function loadFor(db: Executor, userId: string, id: string) {
  const row = await load(db, id);
  const p = await powers(db, userId);
  const org = row.organization.id;
  const own = p.authorOrgIds.has(org) || p.publisherOrgIds.has(org);
  const anyRole = p.authorOrgIds.size > 0 || p.publisherOrgIds.size > 0;
  if (!own && !(anyRole && row.status === 'published')) {
    throw new ExerciseError('not_found', NOT_FOUND);
  }
  return { row, p };
}

export async function getExercise(
  db: Database,
  userId: string,
  id: string,
): Promise<ExerciseDetail> {
  const { row, p } = await loadFor(db, userId, id);
  return {
    ...toSummary(row, userId, p),
    content: row.content,
    play: exercisePlay(row.content),
    canEdit: p.authorOrgIds.has(row.organization.id),
    draftId: row.draftId,
  };
}

async function assertCompetency(db: Executor, competencyId: string) {
  const [c] = await db
    .select({ id: competencies.id })
    .from(competencies)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .where(and(eq(competencies.id, competencyId), eq(curriculumVersions.status, 'published')));
  if (!c) throw new ExerciseError('invalid', 'Choisissez une compétence d’un programme publié.');
}

/** Contenu de départ d'un nouvel exercice, selon son type. */
export function starterContent(kind: ExerciseKind): ExerciseContent {
  const common = { prompt: 'Consigne à écrire.', explanation: '', media: null };
  switch (kind) {
    case 'choice':
    case 'media':
      return {
        kind,
        ...common,
        choices: ['Réponse 1', 'Réponse 2'],
        correct: 0,
      } as ExerciseContent;
    case 'truefalse':
      return { kind, ...common, correct: true };
    case 'gaps':
      return { kind, ...common, text: 'Le [[chat]] boit du lait.' };
    case 'match':
      return {
        kind,
        ...common,
        pairs: [
          { left: 'Élément 1', right: 'Associé 1' },
          { left: 'Élément 2', right: 'Associé 2' },
        ],
      };
    case 'order':
      return { kind, ...common, items: ['Premier', 'Deuxième', 'Troisième'] };
    case 'number':
      return { kind, ...common, answer: 0, tolerance: 0, unit: '' };
    case 'table':
      return {
        kind,
        ...common,
        table: { header: ['Jour', 'Valeur'], rows: [['Lundi', '0']] },
        choices: ['Réponse 1', 'Réponse 2'],
        correct: 0,
      };
    case 'reading':
      return {
        kind,
        ...common,
        passage: 'Texte à lire.',
        questions: [{ prompt: 'Question ?', choices: ['Réponse 1', 'Réponse 2'], correct: 0 }],
      };
  }
}

export async function createExercise(
  db: Database,
  userId: string,
  input: CreateExerciseInput,
  traceId?: string,
): Promise<{ id: string }> {
  const p = await powers(db, userId);
  if (!p.authorOrgIds.has(input.organizationId)) {
    throw new ExerciseError(
      'forbidden',
      'Vous ne pouvez pas créer d’exercice pour cette structure.',
    );
  }
  await assertCompetency(db, input.competencyId);
  const [row] = await db
    .insert(exercises)
    .values({
      organizationId: input.organizationId,
      competencyId: input.competencyId,
      domain: input.domain,
      difficulty: input.difficulty,
      skill: input.skill,
      kind: input.kind,
      title: input.title,
      content: starterContent(input.kind),
      authorId: userId,
    })
    .returning({ id: exercises.id });
  await audit(db, userId, 'exercise.create', row!.id, traceId);
  return { id: row!.id };
}

async function loadForAuthor(db: Executor, userId: string, id: string) {
  const { row, p } = await loadFor(db, userId, id);
  if (!p.authorOrgIds.has(row.organization.id)) {
    throw new ExerciseError(
      'forbidden',
      'Seuls les auteurs de la structure modifient cet exercice.',
    );
  }
  return row;
}

async function assertMedia(db: Executor, organizationId: string, content: ExerciseContent) {
  if (!content.media) return;
  const [found] = await db
    .select({ id: exerciseMedia.id })
    .from(exerciseMedia)
    .where(
      and(
        eq(exerciseMedia.storageKey, content.media.key),
        eq(exerciseMedia.organizationId, organizationId),
      ),
    );
  if (!found)
    throw new ExerciseError('invalid', 'Le fichier est introuvable : déposez-le à nouveau.');
}

export async function updateExercise(
  db: Database,
  userId: string,
  id: string,
  input: UpdateExerciseInput,
): Promise<ExerciseDetail> {
  const row = await loadForAuthor(db, userId, id);
  if (row.status !== 'draft') {
    throw new ExerciseError(
      'conflict',
      row.status === 'review'
        ? 'Cet exercice est en relecture : attendez la réponse avant de le modifier.'
        : 'Un exercice publié ne change plus : cliquez sur « Modifier » pour en faire une nouvelle version.',
    );
  }
  if (input.content.kind !== row.kind) {
    throw new ExerciseError('invalid', 'Le type d’exercice ne peut pas changer.');
  }
  await assertCompetency(db, input.competencyId);
  await assertMedia(db, row.organization.id, input.content);
  await db
    .update(exercises)
    .set({
      title: input.title,
      competencyId: input.competencyId,
      domain: input.domain,
      difficulty: input.difficulty,
      skill: input.skill,
      content: input.content,
      updatedAt: new Date(),
    })
    .where(eq(exercises.id, id));
  return getExercise(db, userId, id);
}

/** Envoie en relecture. */
export async function submitExercise(db: Database, userId: string, id: string, traceId?: string) {
  const row = await loadForAuthor(db, userId, id);
  if (row.status !== 'draft')
    throw new ExerciseError('conflict', 'Cet exercice n’est pas un brouillon.');
  if (row.content.prompt === 'Consigne à écrire.') {
    throw new ExerciseError('invalid', 'Écrivez la consigne avant d’envoyer en relecture.');
  }
  await db
    .update(exercises)
    .set({ status: 'review', reviewNote: null, updatedAt: new Date() })
    .where(eq(exercises.id, id));
  await audit(db, userId, 'exercise.submit', id, traceId);
}

async function loadForPublisher(db: Executor, userId: string, id: string) {
  const { row, p } = await loadFor(db, userId, id);
  if (!p.publisherOrgIds.has(row.organization.id)) {
    throw new ExerciseError(
      'forbidden',
      'Seuls la direction, le référent et le conseiller pédagogique relisent les exercices.',
    );
  }
  if (row.authorId === userId && !p.superadmin) {
    throw new ExerciseError(
      'forbidden',
      'Vous ne pouvez pas relire votre propre exercice : une autre personne doit le faire.',
    );
  }
  return row;
}

/** Publie ; un brouillon qui remplace un exercice publié retire l'ancien. */
export async function publishExercise(db: Database, userId: string, id: string, traceId?: string) {
  const row = await loadForPublisher(db, userId, id);
  if (row.status !== 'review') {
    throw new ExerciseError('conflict', 'Seul un exercice en relecture se publie.');
  }
  await db.transaction(async (tx) => {
    const [me] = await tx
      .select({ replaces: exercises.replacesId })
      .from(exercises)
      .where(eq(exercises.id, id));
    if (me?.replaces) {
      await tx
        .update(exercises)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(and(eq(exercises.id, me.replaces), eq(exercises.status, 'published')));
    }
    await tx
      .update(exercises)
      .set({
        status: 'published',
        reviewedBy: userId,
        reviewNote: null,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(exercises.id, id));
    await audit(tx, userId, 'exercise.publish', id, traceId);
  });
}

/** Renvoie à l'auteur avec une remarque. */
export async function returnExercise(
  db: Database,
  userId: string,
  id: string,
  note: string,
  traceId?: string,
) {
  const row = await loadForPublisher(db, userId, id);
  if (row.status !== 'review')
    throw new ExerciseError('conflict', 'Cet exercice n’est pas en relecture.');
  await db
    .update(exercises)
    .set({ status: 'draft', reviewNote: note, updatedAt: new Date() })
    .where(eq(exercises.id, id));
  await audit(db, userId, 'exercise.return', id, traceId);
}

/** Retire de la banque, ou remet en ligne. */
export async function setExerciseArchived(
  db: Database,
  userId: string,
  id: string,
  archived: boolean,
  traceId?: string,
) {
  const { row, p } = await loadFor(db, userId, id);
  if (!p.publisherOrgIds.has(row.organization.id)) {
    throw new ExerciseError(
      'forbidden',
      'Seuls les relecteurs de la structure retirent un exercice.',
    );
  }
  const from = archived ? 'published' : 'archived';
  if (row.status !== from) throw new ExerciseError('conflict', 'Action impossible dans cet état.');
  await db
    .update(exercises)
    .set({ status: archived ? 'archived' : 'published', updatedAt: new Date() })
    .where(eq(exercises.id, id));
  await audit(db, userId, archived ? 'exercise.archive' : 'exercise.restore', id, traceId);
}

/**
 * Nouvelle version d'un exercice publié (ou copie d'un exercice de la banque commune pour sa
 * propre structure) : un brouillon avec le même contenu.
 */
export async function copyExercise(
  db: Database,
  userId: string,
  id: string,
  organizationId: string | null,
  traceId?: string,
): Promise<{ id: string }> {
  const { row, p } = await loadFor(db, userId, id);
  if (row.status !== 'published' && row.status !== 'archived') {
    throw new ExerciseError('conflict', 'Seul un exercice publié se copie.');
  }
  const own = p.authorOrgIds.has(row.organization.id);
  const target = own ? row.organization.id : organizationId;
  if (!target || !p.authorOrgIds.has(target)) {
    throw new ExerciseError('forbidden', 'Choisissez une de vos structures.');
  }
  if (own && row.draftId) return { id: row.draftId };
  const [copy] = await db
    .insert(exercises)
    .values({
      organizationId: target,
      competencyId: row.competency.id,
      domain: row.domain,
      difficulty: row.difficulty,
      skill: row.skill,
      kind: row.kind,
      title: row.title,
      // Les fichiers déposés appartiennent à une structure : une copie ailleurs les laisse de côté.
      content: own ? row.content : { ...row.content, media: null },
      authorId: userId,
      replacesId: own ? row.id : null,
    })
    .returning({ id: exercises.id });
  await audit(db, userId, 'exercise.copy', copy!.id, traceId);
  return { id: copy!.id };
}

/** Supprime un brouillon jamais publié. */
export async function deleteExercise(db: Database, userId: string, id: string, traceId?: string) {
  const row = await loadForAuthor(db, userId, id);
  if (row.status !== 'draft' || row.publishedAt) {
    throw new ExerciseError('conflict', 'Seul un brouillon jamais publié se supprime.');
  }
  await db.delete(exercises).where(eq(exercises.id, id));
  await audit(db, userId, 'exercise.delete', id, traceId);
}

/** Corrige une réponse (aperçu de l'auteur ou du relecteur). */
export async function checkExercise(
  db: Database,
  userId: string,
  id: string,
  answer: ExerciseAnswer,
): Promise<ExerciseResult> {
  const { row } = await loadFor(db, userId, id);
  return gradeExercise(row.content, answer);
}

/**
 * Import d'exercices (fichier préparé à l'avance, ou propositions de l'IA). Chaque exercice valable
 * est créé ; les autres sont rendus avec leur numéro et la raison. `status` : « review » pour un
 * fichier (relecture directe), « draft » pour l'IA (l'auteur relit et corrige d'abord).
 */
export async function importExercises(
  db: Database,
  userId: string,
  input: { organizationId: string; curriculumVersionId: string; items: unknown[] },
  status: 'draft' | 'review',
  traceId?: string,
): Promise<ExerciseImportResult & { ids: string[] }> {
  const p = await powers(db, userId);
  if (!p.authorOrgIds.has(input.organizationId)) {
    throw new ExerciseError(
      'forbidden',
      'Vous ne pouvez pas créer d’exercice pour cette structure.',
    );
  }
  const comps = await db
    .select({ id: competencies.id, code: competencies.code })
    .from(competencies)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .where(
      and(
        eq(curriculumVersions.id, input.curriculumVersionId),
        eq(curriculumVersions.status, 'published'),
      ),
    );
  if (comps.length === 0) {
    throw new ExerciseError('invalid', 'Choisissez un programme publié.');
  }
  const byCode = new Map(comps.map((c) => [c.code.trim().toUpperCase(), c.id]));
  const errors: ExerciseImportResult['errors'] = [];
  const rows: Array<typeof exercises.$inferInsert> = [];
  input.items.forEach((raw, i) => {
    const title =
      raw && typeof raw === 'object' && typeof (raw as { title?: unknown }).title === 'string'
        ? String((raw as { title: string }).title).slice(0, 120)
        : '';
    const parsed = ExerciseImportItemSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
      errors.push({ index: i + 1, title, message: `${issue?.message ?? 'Illisible.'}${where}` });
      return;
    }
    const item = parsed.data;
    const competencyId = byCode.get(item.competencyCode.trim().toUpperCase());
    if (!competencyId) {
      errors.push({
        index: i + 1,
        title,
        message: `Compétence « ${item.competencyCode} » absente de ce programme.`,
      });
      return;
    }
    rows.push({
      organizationId: input.organizationId,
      competencyId,
      domain: item.domain,
      difficulty: item.difficulty,
      skill: item.skill,
      kind: item.content.kind,
      title: item.title,
      content: { ...item.content, media: null },
      status,
      authorId: userId,
    });
  });
  const created =
    rows.length > 0 ? await db.insert(exercises).values(rows).returning({ id: exercises.id }) : [];
  if (created.length > 0) {
    await audit(db, userId, 'exercise.import', input.organizationId, traceId);
  }
  return { created: created.length, errors, ids: created.map((r) => r.id) };
}
