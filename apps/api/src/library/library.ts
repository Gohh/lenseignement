import {
  LIBRARY_COVER_RULES,
  LIBRARY_FILE_RULES,
  type AddResourceInput,
  type LibraryFormat,
  type ResourceItem,
} from '@lenseignement/types';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { classResources, cohortMembers, cohorts, libraryFiles, users } from '../db/schema.js';
import { canManageCohort } from '../sessions/class-sessions.js';
import { TeamError, audit } from '../team/team.js';
import {
  TooLargeError,
  libraryPath,
  looksLike,
  readHead,
  removeStored,
  storeStream,
} from './storage.js';

export async function addResource(
  db: Database,
  userId: string,
  cohortId: string,
  input: AddResourceInput,
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
  const isLink = input.format === 'lien';
  const [row] = await db
    .insert(classResources)
    .values({
      cohortId,
      createdByUserId: userId,
      title: input.title,
      description: input.description || null,
      url: isLink ? input.url! : null,
      kind: isLink ? input.kind : input.format === 'video' ? 'video' : 'document',
      format: input.format,
      shelf: input.shelf || 'Autres',
      author: input.author || null,
      ...(input.coverColor ? { coverColor: input.coverColor } : {}),
      offlineAllowed: input.offlineAllowed,
    })
    .returning({ id: classResources.id });
  await audit(db, userId, 'resource.add', cohortId, traceId);
  return { id: row!.id };
}

/**
 * Range le fichier d'un livre (contenu ou couverture), envoyé en flux par l'enseignant.
 * Le type annoncé doit correspondre au format du livre ET aux premiers octets du fichier.
 */
export async function addLibraryFile(
  db: Database,
  userId: string,
  resourceId: string,
  role: string,
  mimeHeader: string,
  originalName: string | null,
  body: Readable,
): Promise<{ id: string }> {
  const [resource] = await db
    .select({ cohortId: classResources.cohortId, format: classResources.format })
    .from(classResources)
    .where(eq(classResources.id, resourceId));
  if (!resource || !(await canManageCohort(db, userId, resource.cohortId))) {
    throw new TeamError('not_found', 'Livre introuvable.');
  }
  if (role !== 'content' && role !== 'cover') {
    throw new TeamError('invalid', 'Type de fichier inconnu.');
  }
  const format = resource.format as LibraryFormat;
  if (format === 'lien') throw new TeamError('invalid', 'Un lien n’a pas de fichier.');
  const mime = mimeHeader.split(';')[0]!.trim().toLowerCase();
  const rules = role === 'cover' ? LIBRARY_COVER_RULES : LIBRARY_FILE_RULES[format];
  if (!(rules.mimes as readonly string[]).includes(mime)) {
    throw new TeamError('invalid', 'Ce type de fichier n’est pas accepté pour ce livre.');
  }
  let position = 0;
  if (role === 'content') {
    const [{ n }] = (await db
      .select({ n: count() })
      .from(libraryFiles)
      .where(and(eq(libraryFiles.resourceId, resourceId), eq(libraryFiles.role, 'content')))) as [
      { n: number },
    ];
    if (n >= LIBRARY_FILE_RULES[format].maxFiles) {
      throw new TeamError('invalid', 'Ce livre a déjà tous ses fichiers.');
    }
    position = n;
  }

  let stored: { storageKey: string; sizeBytes: number };
  try {
    stored = await storeStream(body, rules.maxBytes);
  } catch (error) {
    if (error instanceof TooLargeError) {
      const mb = Math.round(rules.maxBytes / (1024 * 1024));
      throw new TeamError('invalid', `Le fichier est trop lourd (${mb} Mo au plus).`);
    }
    throw error;
  }
  if (stored.sizeBytes === 0 || !looksLike(mime, await readHead(stored.storageKey))) {
    await removeStored(stored.storageKey);
    throw new TeamError('invalid', 'Le fichier est vide ou ne correspond pas à son type.');
  }

  if (role === 'cover') {
    const old = await db
      .select({ id: libraryFiles.id, storageKey: libraryFiles.storageKey })
      .from(libraryFiles)
      .where(and(eq(libraryFiles.resourceId, resourceId), eq(libraryFiles.role, 'cover')));
    for (const file of old) {
      await db.delete(libraryFiles).where(eq(libraryFiles.id, file.id));
      await removeStored(file.storageKey);
    }
  }
  const [row] = await db
    .insert(libraryFiles)
    .values({
      resourceId,
      role,
      position,
      mime,
      sizeBytes: stored.sizeBytes,
      originalName: originalName ? originalName.slice(0, 200) : null,
      storageKey: stored.storageKey,
    })
    .returning({ id: libraryFiles.id });
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
  const files = await db
    .select({ storageKey: libraryFiles.storageKey })
    .from(libraryFiles)
    .where(eq(libraryFiles.resourceId, resourceId));
  await db.delete(classResources).where(eq(classResources.id, resourceId));
  for (const file of files) await removeStored(file.storageKey);
  await audit(db, userId, 'resource.remove', resource.cohortId, traceId);
}

/** Classes dont la personne voit la bibliothèque : les siennes et celles que sa direction gère. */
async function visibleCohortIds(db: Database, userId: string): Promise<string[]> {
  const mine = await db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(eq(cohortMembers.userId, userId));
  const managed = await db.execute(
    sql`select c.id from cohorts c where c.organization_id in ${teamOrganizationIds(userId)}`,
  );
  return [
    ...new Set([
      ...mine.map((m) => m.cohortId),
      ...managed.rows.map((r) => String((r as { id: string }).id)),
    ]),
  ];
}

/** Un fichier de livre, lu par une personne qui voit la classe du livre. */
export async function readLibraryFile(
  db: Database,
  userId: string,
  fileId: string,
): Promise<{ mime: string; sizeBytes: number; path: string }> {
  const [row] = await db
    .select({
      mime: libraryFiles.mime,
      sizeBytes: libraryFiles.sizeBytes,
      storageKey: libraryFiles.storageKey,
      cohortId: classResources.cohortId,
    })
    .from(libraryFiles)
    .innerJoin(classResources, eq(classResources.id, libraryFiles.resourceId))
    .where(eq(libraryFiles.id, fileId));
  if (!row || !(await visibleCohortIds(db, userId)).includes(row.cohortId)) {
    throw new TeamError('not_found', 'Fichier introuvable.');
  }
  const path = libraryPath(row.storageKey);
  // Fichier effacé du disque (dossier déplacé, sauvegarde incomplète) : introuvable, sans planter.
  const onDisk = await stat(path).catch(() => null);
  if (!onDisk?.isFile()) throw new TeamError('not_found', 'Fichier introuvable.');
  return { mime: row.mime, sizeBytes: onDisk.size, path };
}

/** Livres des classes de la personne (élève ou enseignant) et de celles que sa direction gère. */
export async function myResources(db: Database, userId: string): Promise<ResourceItem[]> {
  const cohortIds = await visibleCohortIds(db, userId);
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
      format: classResources.format,
      shelf: classResources.shelf,
      author: classResources.author,
      coverColor: classResources.coverColor,
      offlineAllowed: classResources.offlineAllowed,
      createdAt: classResources.createdAt,
      teacherName: users.displayName,
    })
    .from(classResources)
    .innerJoin(cohorts, eq(cohorts.id, classResources.cohortId))
    .innerJoin(users, eq(users.id, classResources.createdByUserId))
    .where(inArray(classResources.cohortId, cohortIds))
    .orderBy(desc(classResources.createdAt));
  const files =
    rows.length === 0
      ? []
      : await db
          .select({
            id: libraryFiles.id,
            resourceId: libraryFiles.resourceId,
            role: libraryFiles.role,
            mime: libraryFiles.mime,
            sizeBytes: libraryFiles.sizeBytes,
          })
          .from(libraryFiles)
          .where(
            inArray(
              libraryFiles.resourceId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(libraryFiles.position));
  const manageable = new Map<string, boolean>();
  const items: ResourceItem[] = [];
  for (const r of rows) {
    const content = files.filter((f) => f.resourceId === r.id && f.role === 'content');
    // Un livre dont l'envoi n'est pas allé au bout n'est montré à personne.
    if (r.format !== 'lien' && content.length === 0) continue;
    if (!manageable.has(r.cohortId)) {
      manageable.set(r.cohortId, await canManageCohort(db, userId, r.cohortId));
    }
    items.push({
      id: r.id,
      cohortId: r.cohortId,
      cohortName: r.cohortName,
      title: r.title,
      description: r.description,
      url: r.url,
      kind: r.kind as ResourceItem['kind'],
      format: r.format as LibraryFormat,
      shelf: r.shelf,
      author: r.author,
      coverColor: r.coverColor,
      coverFileId: files.find((f) => f.resourceId === r.id && f.role === 'cover')?.id ?? null,
      files: content.map((f) => ({ id: f.id, mime: f.mime, sizeBytes: f.sizeBytes })),
      offlineAllowed: r.offlineAllowed,
      addedAt: r.createdAt.toISOString(),
      teacherName: r.teacherName,
      canManage: manageable.get(r.cohortId)!,
    });
  }
  return items;
}
