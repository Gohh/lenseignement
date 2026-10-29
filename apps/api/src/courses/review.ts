import type {
  ApproveInput,
  CourseVersionStatus,
  CourseWorkflow,
  MyWorkItem,
  ReviewAction,
  ReviewQueueItem,
} from '@lenseignement/types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  organizationIdsWithRoles,
  PUBLISHER_ROLES,
  REVIEWER_ROLES,
} from '../access/access.service.js';
import type { Database } from '../db/database.js';
import {
  courseModules,
  courseReviewEvents,
  courses,
  courseVersionCompetencies,
  courseVersions,
  lessons,
  organizations,
  users,
} from '../db/schema.js';
import { CourseError } from './courses.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;
type VersionRow = typeof courseVersions.$inferSelect;

interface Capacities {
  reviewer: boolean;
  publisher: boolean;
}

/** Rôles de validation de la personne sur la structure d'une version (sous-structures comprises). */
async function capacities(db: Executor, userId: string, organizationId: string) {
  const has = async (roles: readonly string[]) => {
    const { rows } = await db.execute(
      sql`select 1 from ${organizationIdsWithRoles(userId, roles)} o where o.id = ${organizationId}`,
    );
    return rows.length > 0;
  };
  const [reviewer, publisher] = await Promise.all([has(REVIEWER_ROLES), has(PUBLISHER_ROLES)]);
  return { reviewer, publisher };
}

/** Personnes qui ont déjà rédigé, soumis ou approuvé la version : elles ne valident pas après. */
function involved(v: VersionRow, upTo: 'submitted' | 'approved'): Array<string | null> {
  return upTo === 'submitted'
    ? [v.createdBy, v.submittedBy]
    : [v.createdBy, v.submittedBy, v.approvedBy];
}

function permissions(v: VersionRow, userId: string, c: Capacities): CourseWorkflow['can'] {
  const independentReviewer = c.reviewer && !involved(v, 'submitted').includes(userId);
  const independentPublisher = c.publisher && !involved(v, 'approved').includes(userId);
  return {
    submit: v.status === 'draft',
    approve: v.status === 'in_review' && independentReviewer,
    requestChanges:
      (v.status === 'in_review' && independentReviewer) ||
      (v.status === 'approved' && independentPublisher),
    publish: v.status === 'approved' && independentPublisher,
    withdraw: v.status === 'published' && c.publisher,
  };
}

/** Ce qui manque à un brouillon pour être relu (cahier §7 : programme et compétences obligatoires). */
async function missingForReview(db: Executor, v: VersionRow): Promise<string[]> {
  const [competencyCount, moduleRows, lessonRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(courseVersionCompetencies)
      .where(eq(courseVersionCompetencies.courseVersionId, v.id)),
    db
      .select({ id: courseModules.id })
      .from(courseModules)
      .where(eq(courseModules.courseVersionId, v.id)),
    db
      .select({ moduleId: lessons.moduleId, body: lessons.body })
      .from(lessons)
      .where(eq(lessons.courseVersionId, v.id)),
  ]);
  const missing: string[] = [];
  if (!v.curriculumVersionId) missing.push('Relier le cours à une version de programme.');
  if ((competencyCount[0]?.n ?? 0) === 0) missing.push('Cocher au moins une compétence visée.');
  if (moduleRows.length === 0) missing.push('Ajouter au moins un module au plan.');
  if (moduleRows.some((m) => !lessonRows.some((l) => l.moduleId === m.id))) {
    missing.push('Chaque module doit contenir au moins une leçon.');
  }
  if (lessonRows.some((l) => l.body.trim() === '')) {
    missing.push('Chaque leçon doit avoir un contenu.');
  }
  return missing;
}

async function lockVersion(tx: Tx, versionId: string) {
  const [row] = await tx
    .select({ version: courseVersions, organizationId: courses.organizationId })
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .where(eq(courseVersions.id, versionId))
    .for('update', { of: courseVersions });
  if (!row) throw new CourseError('not_found', 'Version introuvable.');
  return row;
}

function expectStatus(v: VersionRow, status: CourseVersionStatus, message: string) {
  if (v.status !== status) throw new CourseError('conflict', message);
}

async function record(
  tx: Tx,
  versionId: string,
  action: ReviewAction,
  actorUserId: string,
  comment = '',
  checklist?: Record<string, boolean>,
) {
  await tx
    .insert(courseReviewEvents)
    .values({ courseVersionId: versionId, action, actorUserId, comment, checklist });
}

export async function getWorkflow(
  db: Database,
  versionId: string,
  userId: string,
): Promise<CourseWorkflow> {
  const [row] = await db
    .select({ version: courseVersions, organizationId: courses.organizationId })
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .where(eq(courseVersions.id, versionId));
  if (!row) throw new CourseError('not_found', 'Version introuvable.');
  const [c, history, missing] = await Promise.all([
    capacities(db, userId, row.organizationId),
    db
      .select({
        action: courseReviewEvents.action,
        actorName: users.displayName,
        comment: courseReviewEvents.comment,
        createdAt: courseReviewEvents.createdAt,
      })
      .from(courseReviewEvents)
      .innerJoin(users, eq(users.id, courseReviewEvents.actorUserId))
      .where(eq(courseReviewEvents.courseVersionId, versionId))
      .orderBy(asc(courseReviewEvents.createdAt), asc(courseReviewEvents.id)),
    row.version.status === 'draft' ? missingForReview(db, row.version) : Promise.resolve([]),
  ]);
  return {
    history: history.map((h) => ({
      ...h,
      actorName: h.actorName ?? 'Personne inconnue',
      createdAt: h.createdAt.toISOString(),
    })),
    can: permissions(row.version, userId, c),
    missing,
  };
}

/** Versions à relire ou à publier dans les structures où la personne valide. */
export async function listReviewQueue(db: Database, userId: string): Promise<ReviewQueueItem[]> {
  const rows = await db
    .select({
      versionId: courseVersions.id,
      courseId: courses.id,
      number: courseVersions.number,
      status: courseVersions.status,
      title: courseVersions.title,
      organization: { id: organizations.id, name: organizations.name },
      updatedAt: courseVersions.updatedAt,
    })
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .innerJoin(organizations, eq(organizations.id, courses.organizationId))
    .where(
      and(
        inArray(courseVersions.status, ['in_review', 'approved']),
        sql`${courses.organizationId} in ${organizationIdsWithRoles(userId, PUBLISHER_ROLES, sql`${courses.branch}`)}`,
      ),
    )
    .orderBy(desc(courseVersions.updatedAt));
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

/**
 * Tout ce qui attend la personne : ses brouillons (dont ceux renvoyés avec une remarque), les
 * cours à relire et à publier. Les règles d'indépendance sont celles du circuit : on ne voit pas
 * à relire ce qu'on a rédigé ou soumis, ni à publier ce qu'on a rédigé, soumis ou approuvé.
 */
export async function listMyWork(db: Database, userId: string): Promise<MyWorkItem[]> {
  const columns = {
    version: courseVersions,
    courseId: courses.id,
    organization: { id: organizations.id, name: organizations.name },
  };
  const base = () =>
    db
      .select(columns)
      .from(courseVersions)
      .innerJoin(courses, eq(courses.id, courseVersions.courseId))
      .innerJoin(organizations, eq(organizations.id, courses.organizationId));
  const [drafts, toReview, toPublish] = await Promise.all([
    base().where(and(eq(courseVersions.status, 'draft'), eq(courseVersions.createdBy, userId))),
    base().where(
      and(
        eq(courseVersions.status, 'in_review'),
        sql`${courses.organizationId} in ${organizationIdsWithRoles(userId, REVIEWER_ROLES, sql`${courses.branch}`)}`,
      ),
    ),
    base().where(
      and(
        eq(courseVersions.status, 'approved'),
        sql`${courses.organizationId} in ${organizationIdsWithRoles(userId, PUBLISHER_ROLES, sql`${courses.branch}`)}`,
      ),
    ),
  ]);

  // Dernier événement de chaque brouillon : un renvoi pour correction porte la remarque.
  const draftIds = drafts.map((d) => d.version.id);
  const remarks = new Map<string, { comment: string; by: string | null }>();
  if (draftIds.length > 0) {
    const events = await db
      .select({
        versionId: courseReviewEvents.courseVersionId,
        action: courseReviewEvents.action,
        comment: courseReviewEvents.comment,
        by: users.displayName,
      })
      .from(courseReviewEvents)
      .leftJoin(users, eq(users.id, courseReviewEvents.actorUserId))
      .where(inArray(courseReviewEvents.courseVersionId, draftIds))
      .orderBy(asc(courseReviewEvents.createdAt));
    for (const e of events) {
      if (e.action === 'changes_requested') {
        remarks.set(e.versionId, { comment: e.comment, by: e.by });
      } else if (e.action === 'submitted') {
        remarks.delete(e.versionId);
      }
    }
  }

  const items: MyWorkItem[] = [];
  const add = (
    row: (typeof drafts)[number],
    kind: MyWorkItem['kind'],
    remark?: { comment: string; by: string | null },
  ) =>
    items.push({
      versionId: row.version.id,
      courseId: row.courseId,
      number: row.version.number,
      status: row.version.status,
      title: row.version.title,
      organization: row.organization,
      updatedAt: row.version.updatedAt.toISOString(),
      kind,
      remark: remark?.comment ?? null,
      remarkBy: remark?.by ?? null,
    });
  for (const d of drafts) {
    const remark = remarks.get(d.version.id);
    add(d, remark ? 'to_fix' : 'to_write', remark);
  }
  for (const r of toReview) {
    if (!involved(r.version, 'submitted').includes(userId)) add(r, 'to_review');
  }
  for (const r of toPublish) {
    if (!involved(r.version, 'approved').includes(userId)) add(r, 'to_publish');
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** L'auteur envoie son brouillon en relecture ; il ne peut plus le modifier ensuite. */
export async function submitForReview(
  db: Database,
  versionId: string,
  userId: string,
  revision: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { version } = await lockVersion(tx, versionId);
    expectStatus(version, 'draft', 'Cette version a déjà été envoyée en relecture.');
    if (version.revision !== revision) {
      throw new CourseError(
        'conflict',
        'Ce brouillon a été modifié entre-temps. Rechargez la page avant de l’envoyer.',
      );
    }
    const missing = await missingForReview(tx, version);
    if (missing.length > 0) {
      throw new CourseError('invalid', `Avant l’envoi en relecture : ${missing.join(' ')}`);
    }
    await tx
      .update(courseVersions)
      .set({ status: 'in_review', submittedBy: userId, updatedAt: sql`now()` })
      .where(eq(courseVersions.id, versionId));
    await record(tx, versionId, 'submitted', userId);
  });
}

export async function approve(
  db: Database,
  versionId: string,
  userId: string,
  input: ApproveInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { version, organizationId } = await lockVersion(tx, versionId);
    expectStatus(version, 'in_review', 'Cette version n’est pas en attente de relecture.');
    const can = permissions(version, userId, await capacities(tx, userId, organizationId));
    if (!can.approve) {
      throw new CourseError(
        'forbidden',
        'Vous avez rédigé ou soumis cette version : un autre référent doit l’approuver.',
      );
    }
    await tx
      .update(courseVersions)
      .set({ status: 'approved', approvedBy: userId, updatedAt: sql`now()` })
      .where(eq(courseVersions.id, versionId));
    await record(tx, versionId, 'approved', userId, input.comment, input.checklist);
  });
}

/** Renvoie la version à son auteur, en brouillon, avec un motif. */
export async function requestChanges(
  db: Database,
  versionId: string,
  userId: string,
  comment: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { version, organizationId } = await lockVersion(tx, versionId);
    if (version.status !== 'in_review' && version.status !== 'approved') {
      throw new CourseError('conflict', 'Cette version n’est pas en cours de validation.');
    }
    const can = permissions(version, userId, await capacities(tx, userId, organizationId));
    if (!can.requestChanges) {
      throw new CourseError(
        'forbidden',
        'Seul un validateur indépendant de l’auteur peut demander des modifications.',
      );
    }
    await tx
      .update(courseVersions)
      .set({ status: 'draft', submittedBy: null, approvedBy: null, updatedAt: sql`now()` })
      .where(eq(courseVersions.id, versionId));
    await record(tx, versionId, 'changes_requested', userId, comment);
  });
}

/** Deuxième validation : publie la version et archive celle qu'elle remplace. */
export async function publish(db: Database, versionId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { version, organizationId } = await lockVersion(tx, versionId);
    expectStatus(version, 'approved', 'Seule une version approuvée peut être publiée.');
    const can = permissions(version, userId, await capacities(tx, userId, organizationId));
    if (!can.publish) {
      throw new CourseError(
        'forbidden',
        'La publication exige une deuxième personne, distincte de l’auteur et de l’approbateur.',
      );
    }
    const replaced = await tx
      .update(courseVersions)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(
        and(eq(courseVersions.courseId, version.courseId), eq(courseVersions.status, 'published')),
      )
      .returning({ id: courseVersions.id });
    for (const old of replaced) {
      await record(tx, old.id, 'replaced', userId, `Remplacée par la version ${version.number}.`);
    }
    await tx
      .update(courseVersions)
      .set({
        status: 'published',
        publishedBy: userId,
        publishedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(courseVersions.id, versionId));
    await record(tx, versionId, 'published', userId);
  });
}

/** Procédure de retrait (cahier §7) : la version publiée est archivée, avec son motif. */
export async function withdraw(
  db: Database,
  versionId: string,
  userId: string,
  comment: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const { version } = await lockVersion(tx, versionId);
    expectStatus(version, 'published', 'Seule une version publiée peut être retirée.');
    await tx
      .update(courseVersions)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(eq(courseVersions.id, versionId));
    await record(tx, versionId, 'withdrawn', userId, comment);
  });
}
