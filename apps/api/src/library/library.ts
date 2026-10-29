import type { ResourceItem } from '@lenseignement/types';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { classResources, cohortMembers, cohorts, users } from '../db/schema.js';
import { canManageCohort } from '../sessions/class-sessions.js';
import { TeamError, audit } from '../team/team.js';

export async function addResource(
  db: Database,
  userId: string,
  cohortId: string,
  input: { title: string; description?: string; url: string; kind: ResourceItem['kind'] },
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
    .insert(classResources)
    .values({
      cohortId,
      createdByUserId: userId,
      title: input.title,
      description: input.description || null,
      url: input.url,
      kind: input.kind,
    })
    .returning({ id: classResources.id });
  await audit(db, userId, 'resource.add', cohortId, traceId);
  return { id: row!.id };
}

export async function removeResource(
  db: Database,
  userId: string,
  resourceId: string,
  traceId?: string,
): Promise<void> {
  const [resource] = await db
    .select()
    .from(classResources)
    .where(eq(classResources.id, resourceId));
  if (!resource || !(await canManageCohort(db, userId, resource.cohortId))) {
    throw new TeamError('not_found', 'Ressource introuvable.');
  }
  await db.delete(classResources).where(eq(classResources.id, resourceId));
  await audit(db, userId, 'resource.remove', resource.cohortId, traceId);
}

/** Ressources des classes de la personne (élève ou enseignant) et de celles que sa direction gère. */
export async function myResources(db: Database, userId: string): Promise<ResourceItem[]> {
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
      id: classResources.id,
      cohortId: classResources.cohortId,
      cohortName: cohorts.name,
      title: classResources.title,
      description: classResources.description,
      url: classResources.url,
      kind: classResources.kind,
      createdAt: classResources.createdAt,
      teacherName: users.displayName,
    })
    .from(classResources)
    .innerJoin(cohorts, eq(cohorts.id, classResources.cohortId))
    .innerJoin(users, eq(users.id, classResources.createdByUserId))
    .where(inArray(classResources.cohortId, cohortIds))
    .orderBy(desc(classResources.createdAt));
  const items: ResourceItem[] = [];
  for (const r of rows) {
    items.push({
      id: r.id,
      cohortId: r.cohortId,
      cohortName: r.cohortName,
      title: r.title,
      description: r.description,
      url: r.url,
      kind: r.kind as ResourceItem['kind'],
      addedAt: r.createdAt.toISOString(),
      teacherName: r.teacherName,
      canManage: await canManageCohort(db, userId, r.cohortId),
    });
  }
  return items;
}
