import { randomBytes } from 'node:crypto';
import type { ClassSessionItem } from '@lenseignement/types';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { classSessions, cohortMembers, cohorts, users } from '../db/schema.js';
import { teamOrganizationIds } from '../access/access.service.js';
import { TeamError, audit } from '../team/team.js';

const VISIO = 'https://meet.jit.si';

async function isTeacherOf(db: Database, userId: string, cohortId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: cohortMembers.userId })
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        eq(cohortMembers.userId, userId),
        eq(cohortMembers.role, 'enseignant'),
      ),
    );
  return Boolean(row);
}

/** Droit de programmer, modifier ou annuler : l'enseignant de la classe ou la direction qui la gère. */
export async function canManageCohort(
  db: Database,
  userId: string,
  cohortId: string,
): Promise<boolean> {
  if (await isTeacherOf(db, userId, cohortId)) return true;
  const { rows } = await db.execute(
    sql`select 1 from cohorts c where c.id = ${cohortId}
        and c.organization_id in ${teamOrganizationIds(userId)}`,
  );
  return rows.length > 0;
}

export async function createClassSession(
  db: Database,
  userId: string,
  cohortId: string,
  input: { title: string; subject?: string; startsAt: string; durationMinutes: number },
  traceId?: string,
): Promise<{ id: string }> {
  const [cohort] = await db
    .select({ id: cohorts.id, archivedAt: cohorts.archivedAt })
    .from(cohorts)
    .where(eq(cohorts.id, cohortId));
  if (!cohort || !(await canManageCohort(db, userId, cohortId))) {
    throw new TeamError('not_found', 'Classe introuvable.');
  }
  if (cohort.archivedAt) throw new TeamError('invalid', 'Cette classe est archivée.');
  const [row] = await db
    .insert(classSessions)
    .values({
      cohortId,
      createdByUserId: userId,
      title: input.title,
      subject: input.subject || null,
      startsAt: new Date(input.startsAt),
      durationMinutes: input.durationMinutes,
      room: `lenseignement-${randomBytes(8).toString('hex')}`,
    })
    .returning({ id: classSessions.id });
  await audit(db, userId, 'class-session.create', cohortId, traceId);
  return { id: row!.id };
}

async function managedSession(db: Database, userId: string, sessionId: string) {
  const [session] = await db.select().from(classSessions).where(eq(classSessions.id, sessionId));
  if (!session || !(await canManageCohort(db, userId, session.cohortId))) {
    throw new TeamError('not_found', 'Séance introuvable.');
  }
  return session;
}

export async function updateClassSession(
  db: Database,
  userId: string,
  sessionId: string,
  input: { summary?: string; resourceUrl?: string },
): Promise<void> {
  await managedSession(db, userId, sessionId);
  await db
    .update(classSessions)
    .set({
      ...(input.summary !== undefined ? { summary: input.summary || null } : {}),
      ...(input.resourceUrl !== undefined ? { resourceUrl: input.resourceUrl || null } : {}),
    })
    .where(eq(classSessions.id, sessionId));
}

export async function deleteClassSession(
  db: Database,
  userId: string,
  sessionId: string,
  traceId?: string,
): Promise<void> {
  const session = await managedSession(db, userId, sessionId);
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  await audit(db, userId, 'class-session.delete', session.cohortId, traceId);
}

/**
 * Séances des classes de la personne (élève ou enseignant), du mois passé jusqu'aux séances à venir.
 * Le lien de visio n'est donné qu'aux membres de la classe et à ceux qui la gèrent.
 */
export async function mySessions(db: Database, userId: string): Promise<ClassSessionItem[]> {
  const mine = await db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(eq(cohortMembers.userId, userId));
  const managed = await db.execute(
    sql`select c.id from cohorts c where c.organization_id in ${teamOrganizationIds(userId)}`,
  );
  const cohortIds = [
    ...new Set([
      ...mine.map((m) => m.cohortId),
      ...managed.rows.map((r) => String((r as { id: string }).id)),
    ]),
  ];
  if (cohortIds.length === 0) return [];
  const rows = await db
    .select({
      id: classSessions.id,
      cohortId: classSessions.cohortId,
      cohortName: cohorts.name,
      title: classSessions.title,
      subject: classSessions.subject,
      startsAt: classSessions.startsAt,
      durationMinutes: classSessions.durationMinutes,
      room: classSessions.room,
      summary: classSessions.summary,
      resourceUrl: classSessions.resourceUrl,
      teacherName: users.displayName,
    })
    .from(classSessions)
    .innerJoin(cohorts, eq(cohorts.id, classSessions.cohortId))
    .innerJoin(users, eq(users.id, classSessions.createdByUserId))
    .where(
      and(
        inArray(classSessions.cohortId, cohortIds),
        sql`${classSessions.startsAt} > now() - interval '30 days'`,
      ),
    )
    .orderBy(asc(classSessions.startsAt));
  const items: ClassSessionItem[] = [];
  for (const r of rows) {
    items.push({
      id: r.id,
      cohortId: r.cohortId,
      cohortName: r.cohortName,
      title: r.title,
      subject: r.subject,
      startsAt: r.startsAt.toISOString(),
      endsAt: new Date(r.startsAt.getTime() + r.durationMinutes * 60_000).toISOString(),
      teacherName: r.teacherName,
      joinUrl: `${VISIO}/${r.room}`,
      summary: r.summary,
      resourceUrl: r.resourceUrl,
      canManage: await canManageCohort(db, userId, r.cohortId),
    });
  }
  return items;
}
