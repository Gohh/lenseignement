import {
  CurriculumFileSchema,
  type AdminCurriculum,
  type AdminCurriculumDetail,
  type AdminCurriculumVersion,
  type CurriculaAdminOverview,
} from '@lenseignement/types';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/database.js';
import {
  auditLogs,
  competencies,
  competencyEdges,
  curricula,
  curriculumVersions,
  levels,
  policySources,
  subjects,
} from '../db/schema.js';
import { TeamError, teamPowers } from '../team/team.js';
import {
  CurriculumError,
  importCurriculumVersion,
  loadVersionContent,
  publishCurriculumVersion,
} from './curricula.js';

/**
 * Écran « Programmes » : le superadministrateur, l'administrateur et le référent pédagogique
 * voient tout, brouillons compris, et importent ; seul le référent pédagogique publie (une
 * publication change ce que voient toutes les écoles à partir d'une date).
 */
async function powers(db: Database, userId: string) {
  const { rights } = await teamPowers(db, userId);
  const canImport = rights.has('programmes-importer');
  const canPublish = rights.has('programmes-publier');
  if (!canImport && !canPublish) {
    throw new TeamError(
      'forbidden',
      'Réservé au superadministrateur, à l’administrateur et au référent pédagogique.',
    );
  }
  return { canImport, canPublish };
}

async function auditCurriculum(
  db: Database,
  actorUserId: string,
  action: string,
  resourceId: string,
  traceId?: string,
) {
  await db.insert(auditLogs).values({
    actorUserId,
    action,
    resourceType: 'curriculum',
    resourceId: resourceId.slice(0, 64),
    decision: 'allow',
    reason: 'programmes',
    traceId,
  });
}

/** Nombre de lignes par version, pour une table qui a une colonne `version_id`. */
async function countByVersion(
  db: Database,
  table: typeof levels | typeof subjects | typeof competencies,
  versionIds: string[],
): Promise<Map<string, number>> {
  if (versionIds.length === 0) return new Map();
  const rows = await db
    .select({ versionId: table.versionId, n: sql<number>`count(*)::int` })
    .from(table)
    .where(inArray(table.versionId, versionIds))
    .groupBy(table.versionId);
  return new Map(rows.map((r) => [r.versionId, r.n]));
}

const adminVersionColumns = {
  id: curriculumVersions.id,
  curriculumId: curriculumVersions.curriculumId,
  label: curriculumVersions.label,
  status: curriculumVersions.status,
  effectiveFrom: curriculumVersions.effectiveFrom,
  effectiveTo: curriculumVersions.effectiveTo,
  notes: curriculumVersions.notes,
  createdAt: curriculumVersions.createdAt,
  source: {
    title: policySources.title,
    issuer: policySources.issuer,
    url: policySources.url,
    publishedOn: policySources.publishedOn,
    isOfficial: policySources.isOfficial,
  },
};

type AdminVersionRow = {
  id: string;
  label: string;
  status: 'draft' | 'published';
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  source: {
    title: string;
    issuer: string;
    url: string | null;
    publishedOn: string | null;
    isOfficial: boolean;
  } | null;
};

function toAdminVersion(
  row: AdminVersionRow,
  counts: AdminCurriculumVersion['counts'],
): AdminCurriculumVersion {
  const source = row.source ?? {
    title: '(source inconnue)',
    issuer: '',
    url: null,
    publishedOn: null,
    isOfficial: false,
  };
  return {
    label: row.label,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    notes: row.notes,
    source: {
      title: source.title,
      issuer: source.issuer,
      isOfficial: source.isOfficial,
      ...(source.url ? { url: source.url } : {}),
      ...(source.publishedOn ? { publishedOn: source.publishedOn } : {}),
    },
    counts,
  };
}

/** Brouillons d'abord (les plus récents), puis versions publiées de la plus récente à la plus ancienne. */
const versionOrder = (
  a: { status: string; effectiveFrom: string | null; createdAt: Date },
  b: { status: string; effectiveFrom: string | null; createdAt: Date },
) => {
  if (a.status !== b.status) return a.status === 'draft' ? -1 : 1;
  if (a.status === 'draft') return b.createdAt.getTime() - a.createdAt.getTime();
  return (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? '');
};

export async function curriculaOverview(
  db: Database,
  userId: string,
): Promise<CurriculaAdminOverview> {
  const p = await powers(db, userId);
  const programmes = await db
    .select({
      id: curricula.id,
      code: curricula.code,
      branch: curricula.branch,
      title: curricula.title,
      description: curricula.description,
    })
    .from(curricula)
    .orderBy(asc(curricula.title));
  const versions = await db
    .select(adminVersionColumns)
    .from(curriculumVersions)
    .leftJoin(policySources, eq(policySources.id, curriculumVersions.policySourceId));
  const ids = versions.map((v) => v.id);
  const [levelCounts, subjectCounts, competencyCounts] = await Promise.all([
    countByVersion(db, levels, ids),
    countByVersion(db, subjects, ids),
    countByVersion(db, competencies, ids),
  ]);

  const items: AdminCurriculum[] = programmes.map(({ id, ...programme }) => ({
    ...programme,
    versions: versions
      .filter((v) => v.curriculumId === id)
      .sort(versionOrder)
      .map((v) =>
        toAdminVersion(v, {
          levels: levelCounts.get(v.id) ?? 0,
          subjects: subjectCounts.get(v.id) ?? 0,
          competencies: competencyCounts.get(v.id) ?? 0,
        }),
      ),
  }));
  return { items, canPublish: p.canPublish };
}

async function findVersion(db: Database, code: string, label: string) {
  const [row] = await db
    .select({
      ...adminVersionColumns,
      curriculum: {
        code: curricula.code,
        branch: curricula.branch,
        title: curricula.title,
        description: curricula.description,
      },
    })
    .from(curriculumVersions)
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .leftJoin(policySources, eq(policySources.id, curriculumVersions.policySourceId))
    .where(and(eq(curricula.code, code), eq(curriculumVersions.label, label)));
  if (!row) throw new CurriculumError('not_found', `Version inconnue : ${code} ${label}.`);
  const { curriculum, ...version } = row;
  return { curriculum, version };
}

/** Contenu d'une version, brouillon compris, pour la relire avant de la publier. */
export async function curriculumVersionDetail(
  db: Database,
  userId: string,
  code: string,
  label: string,
): Promise<AdminCurriculumDetail> {
  const p = await powers(db, userId);
  const { curriculum, version } = await findVersion(db, code, label);
  const content = await loadVersionContent(db, version.id);
  return {
    ...curriculum,
    version: toAdminVersion(version, {
      levels: content.levels.length,
      subjects: content.subjects.length,
      competencies: content.competencies.length,
    }),
    ...content,
    canPublish: p.canPublish,
  };
}

/**
 * Importe un fichier JSON de programme comme brouillon. Les erreurs disent quel champ corriger.
 */
export async function importCurriculumJson(
  db: Database,
  userId: string,
  json: string,
  traceId?: string,
): Promise<{ code: string; label: string }> {
  if (!(await powers(db, userId)).canImport) {
    throw new TeamError('forbidden', 'Vous ne pouvez pas importer de programme.');
  }
  let data: unknown;
  try {
    data = JSON.parse(json.replace(/^\uFEFF/, ''));
  } catch {
    throw new TeamError('invalid', 'Ce fichier n’est pas un fichier JSON lisible.');
  }
  const parsed = CurriculumFileSchema.safeParse(data);
  if (!parsed.success) {
    throw new TeamError('invalid', `Fichier invalide :\n${z.prettifyError(parsed.error)}`);
  }
  const file = parsed.data;
  await importCurriculumVersion(db, file);
  const ref = `${file.curriculum.code} ${file.version.label}`;
  await auditCurriculum(db, userId, 'curriculum.import', ref, traceId);
  return { code: file.curriculum.code, label: file.version.label };
}

export async function publishCurriculum(
  db: Database,
  userId: string,
  code: string,
  label: string,
  effectiveFrom: string,
  traceId?: string,
): Promise<void> {
  const p = await powers(db, userId);
  if (!p.canPublish) {
    throw new TeamError('forbidden', 'Seul le référent pédagogique publie un programme.');
  }
  await publishCurriculumVersion(db, code, label, effectiveFrom);
  await auditCurriculum(db, userId, 'curriculum.publish', `${code} ${label}`, traceId);
}

/** Supprime un brouillon importé par erreur. Une version publiée ne se supprime jamais. */
export async function deleteCurriculumDraft(
  db: Database,
  userId: string,
  code: string,
  label: string,
  traceId?: string,
): Promise<void> {
  if (!(await powers(db, userId)).canImport) {
    throw new TeamError('forbidden', 'Vous ne pouvez pas importer de programme.');
  }
  const { version } = await findVersion(db, code, label);
  if (version.status !== 'draft') {
    throw new CurriculumError('conflict', 'Une version publiée ne peut pas être supprimée.');
  }
  try {
    await db.transaction(async (tx) => {
      await tx.delete(competencyEdges).where(eq(competencyEdges.versionId, version.id));
      await tx.delete(competencies).where(eq(competencies.versionId, version.id));
      await tx.delete(subjects).where(eq(subjects.versionId, version.id));
      await tx.delete(levels).where(eq(levels.versionId, version.id));
      const [gone] = await tx
        .delete(curriculumVersions)
        .where(eq(curriculumVersions.id, version.id))
        .returning({ sourceId: curriculumVersions.policySourceId });
      if (gone?.sourceId) await tx.delete(policySources).where(eq(policySources.id, gone.sourceId));
    });
  } catch (error) {
    if ((error as { cause?: { code?: string }; code?: string }).cause?.code === '23503') {
      throw new CurriculumError(
        'conflict',
        'Ce brouillon est déjà utilisé : il ne peut pas être supprimé.',
      );
    }
    throw error;
  }
  await auditCurriculum(db, userId, 'curriculum.draft.delete', `${code} ${label}`, traceId);
}
