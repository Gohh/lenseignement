import type {
  CurriculumDetail,
  CurriculumFile,
  CurriculumSummary,
  CurriculumVersionSummary,
} from '@lenseignement/types';
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  competencies,
  competencyEdges,
  curricula,
  curriculumVersions,
  levels,
  policySources,
  subjects,
} from '../db/schema.js';

/** Erreur métier sur les programmes : message destiné à la personne qui administre. */
export class CurriculumError extends Error {
  constructor(
    readonly kind: 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date du jour en Côte d'Ivoire (UTC+0 toute l'année). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Date calendaire réelle au format AAAA-MM-JJ (refuse par exemple le 30 février). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Importe un fichier de programme comme **brouillon**. Le programme est créé s'il n'existe pas ;
 * un libellé de version déjà utilisé est refusé (une version ne se réécrit pas).
 */
export async function importCurriculumVersion(db: Database, file: CurriculumFile): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .insert(curricula)
      .values({ ...file.curriculum })
      .onConflictDoNothing({ target: curricula.code });
    const [curriculum] = await tx
      .select({ id: curricula.id, branch: curricula.branch })
      .from(curricula)
      .where(eq(curricula.code, file.curriculum.code))
      .for('update');
    if (!curriculum) throw new CurriculumError('not_found', 'Programme introuvable.');
    if (curriculum.branch !== file.curriculum.branch) {
      throw new CurriculumError(
        'conflict',
        `Le programme ${file.curriculum.code} appartient à une autre branche.`,
      );
    }

    const existing = await tx
      .select({ id: curriculumVersions.id })
      .from(curriculumVersions)
      .where(
        and(
          eq(curriculumVersions.curriculumId, curriculum.id),
          eq(curriculumVersions.label, file.version.label),
        ),
      );
    if (existing.length > 0) {
      throw new CurriculumError(
        'conflict',
        `La version ${file.version.label} du programme ${file.curriculum.code} existe déjà.`,
      );
    }

    const [source] = await tx
      .insert(policySources)
      .values({ ...file.version.source })
      .returning({ id: policySources.id });
    const [version] = await tx
      .insert(curriculumVersions)
      .values({
        curriculumId: curriculum.id,
        label: file.version.label,
        notes: file.version.notes,
        policySourceId: source!.id,
      })
      .returning({ id: curriculumVersions.id });
    const versionId = version!.id;

    const levelIds = new Map(
      (
        await tx
          .insert(levels)
          .values(file.levels.map((l, position) => ({ versionId, ...l, position })))
          .returning({ id: levels.id, code: levels.code })
      ).map((r) => [r.code, r.id]),
    );
    const subjectIds = new Map(
      (
        await tx
          .insert(subjects)
          .values(file.subjects.map((s, position) => ({ versionId, ...s, position })))
          .returning({ id: subjects.id, code: subjects.code })
      ).map((r) => [r.code, r.id]),
    );
    const competencyIds = new Map(
      (
        await tx
          .insert(competencies)
          .values(
            file.competencies.map((c, position) => ({
              versionId,
              code: c.code,
              title: c.title,
              description: c.description,
              subjectId: subjectIds.get(c.subject)!,
              levelId: c.level ? levelIds.get(c.level)! : null,
              position,
            })),
          )
          .returning({ id: competencies.id, code: competencies.code })
      ).map((r) => [r.code, r.id]),
    );
    const edges = file.competencies.flatMap((c) =>
      c.prerequisites.map((p) => ({
        versionId,
        prerequisiteId: competencyIds.get(p)!,
        competencyId: competencyIds.get(c.code)!,
      })),
    );
    if (edges.length > 0) await tx.insert(competencyEdges).values(edges);
    return versionId;
  });
}

/**
 * Publie un brouillon à partir d'une date d'effet. La version en vigueur jusque-là est close à
 * cette date. Une nouvelle version doit commencer après toutes les versions déjà publiées :
 * on n'insère pas de version dans le passé.
 */
export async function publishCurriculumVersion(
  db: Database,
  code: string,
  label: string,
  effectiveFrom: string,
): Promise<void> {
  if (!isIsoDate(effectiveFrom)) {
    throw new CurriculumError(
      'conflict',
      `Date d'effet invalide : ${effectiveFrom} (attendu AAAA-MM-JJ).`,
    );
  }
  await db.transaction(async (tx) => {
    // Verrou sur le programme : deux publications simultanées ne peuvent pas se chevaucher.
    const [curriculum] = await tx
      .select({ id: curricula.id })
      .from(curricula)
      .where(eq(curricula.code, code))
      .for('update');
    if (!curriculum) throw new CurriculumError('not_found', `Programme inconnu : ${code}.`);

    const versions = await tx
      .select()
      .from(curriculumVersions)
      .where(eq(curriculumVersions.curriculumId, curriculum.id));
    const draft = versions.find((v) => v.label === label);
    if (!draft) throw new CurriculumError('not_found', `Version inconnue : ${code} ${label}.`);
    if (draft.status !== 'draft') {
      throw new CurriculumError('conflict', `La version ${label} est déjà publiée.`);
    }
    const published = versions.filter((v) => v.status === 'published');
    const latest = published.reduce<(typeof published)[number] | undefined>(
      (acc, v) => (!acc || v.effectiveFrom! > acc.effectiveFrom! ? v : acc),
      undefined,
    );
    if (latest && effectiveFrom <= latest.effectiveFrom!) {
      throw new CurriculumError(
        'conflict',
        `La date d'effet doit être postérieure au ${latest.effectiveFrom} (version ${latest.label}).`,
      );
    }
    if (latest && latest.effectiveTo === null) {
      await tx
        .update(curriculumVersions)
        .set({ effectiveTo: effectiveFrom })
        .where(eq(curriculumVersions.id, latest.id));
    }
    await tx
      .update(curriculumVersions)
      .set({ status: 'published', effectiveFrom, publishedAt: sql`now()` })
      .where(eq(curriculumVersions.id, draft.id));
  });
}

const versionColumns = {
  id: curriculumVersions.id,
  label: curriculumVersions.label,
  effectiveFrom: curriculumVersions.effectiveFrom,
  effectiveTo: curriculumVersions.effectiveTo,
  notes: curriculumVersions.notes,
  sourceTitle: policySources.title,
  sourceIssuer: policySources.issuer,
  sourceUrl: policySources.url,
  sourcePublishedOn: policySources.publishedOn,
  sourceIsOfficial: policySources.isOfficial,
};

interface VersionRow {
  label: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  sourceTitle: string;
  sourceIssuer: string;
  sourceUrl: string | null;
  sourcePublishedOn: string | null;
  sourceIsOfficial: boolean;
}

function toSummary(row: VersionRow): CurriculumVersionSummary {
  return {
    label: row.label,
    effectiveFrom: row.effectiveFrom!,
    effectiveTo: row.effectiveTo,
    notes: row.notes,
    source: {
      title: row.sourceTitle,
      issuer: row.sourceIssuer,
      isOfficial: row.sourceIsOfficial,
      ...(row.sourceUrl ? { url: row.sourceUrl } : {}),
      ...(row.sourcePublishedOn ? { publishedOn: row.sourcePublishedOn } : {}),
    },
  };
}

const curriculumColumns = {
  code: curricula.code,
  branch: curricula.branch,
  title: curricula.title,
  description: curricula.description,
};

/** Condition « version publiée en vigueur à la date donnée ». */
const effectiveOn = (on: string) =>
  and(
    eq(curriculumVersions.status, 'published'),
    lte(curriculumVersions.effectiveFrom, on),
    or(isNull(curriculumVersions.effectiveTo), gt(curriculumVersions.effectiveTo, on)),
  );

export async function listCurricula(
  db: Database,
  branch: string | undefined,
  on: string,
): Promise<CurriculumSummary[]> {
  const rows = await db
    .select({ curriculum: curriculumColumns, version: versionColumns })
    .from(curricula)
    .leftJoin(
      curriculumVersions,
      and(eq(curriculumVersions.curriculumId, curricula.id), effectiveOn(on)),
    )
    .leftJoin(policySources, eq(policySources.id, curriculumVersions.policySourceId))
    .where(
      and(
        branch ? eq(curricula.branch, branch) : undefined,
        // Un programme qui n'a encore qu'un brouillon n'est pas public.
        sql`exists (select 1 from ${curriculumVersions} v where v.curriculum_id = ${curricula.id} and v.status = 'published')`,
      ),
    )
    .orderBy(asc(curricula.title));
  return rows.map(({ curriculum, version }) => ({
    ...curriculum,
    current: version?.id && version.sourceTitle !== null ? toSummary(version as VersionRow) : null,
  }));
}

/** Versions publiées d'un programme, de la plus récente à la plus ancienne. */
export async function listCurriculumVersions(
  db: Database,
  code: string,
): Promise<CurriculumVersionSummary[]> {
  const [curriculum] = await db
    .select({ id: curricula.id })
    .from(curricula)
    .where(eq(curricula.code, code));
  if (!curriculum) throw new CurriculumError('not_found', 'Programme inconnu.');
  const rows = await db
    .select(versionColumns)
    .from(curriculumVersions)
    .innerJoin(policySources, eq(policySources.id, curriculumVersions.policySourceId))
    .where(
      and(
        eq(curriculumVersions.curriculumId, curriculum.id),
        eq(curriculumVersions.status, 'published'),
      ),
    )
    .orderBy(desc(curriculumVersions.effectiveFrom));
  return rows.map(toSummary);
}

/** Contenu complet de la version en vigueur à une date donnée. */
export async function getCurriculumOn(
  db: Database,
  code: string,
  on: string,
): Promise<CurriculumDetail> {
  const [row] = await db
    .select({ curriculum: curriculumColumns, version: versionColumns })
    .from(curricula)
    .innerJoin(
      curriculumVersions,
      and(eq(curriculumVersions.curriculumId, curricula.id), effectiveOn(on)),
    )
    .innerJoin(policySources, eq(policySources.id, curriculumVersions.policySourceId))
    .where(eq(curricula.code, code));
  if (!row)
    throw new CurriculumError(
      'not_found',
      'Aucune version de ce programme en vigueur à cette date.',
    );
  const { curriculum, version } = row;
  return {
    ...curriculum,
    version: toSummary(version),
    ...(await loadVersionContent(db, version.id)),
  };
}

/** Niveaux, matières et compétences (avec prérequis) d'une version, publiée ou brouillon. */
export async function loadVersionContent(
  db: Database,
  versionId: string,
): Promise<Pick<CurriculumDetail, 'levels' | 'subjects' | 'competencies'>> {
  const [levelRows, subjectRows, competencyRows, edgeRows] = await Promise.all([
    db
      .select({ id: levels.id, code: levels.code, title: levels.title })
      .from(levels)
      .where(eq(levels.versionId, versionId))
      .orderBy(asc(levels.position)),
    db
      .select({ id: subjects.id, code: subjects.code, title: subjects.title })
      .from(subjects)
      .where(eq(subjects.versionId, versionId))
      .orderBy(asc(subjects.position)),
    db
      .select()
      .from(competencies)
      .where(eq(competencies.versionId, versionId))
      .orderBy(asc(competencies.position)),
    db.select().from(competencyEdges).where(eq(competencyEdges.versionId, versionId)),
  ]);
  const levelCode = new Map(levelRows.map((l) => [l.id, l.code]));
  const subjectCode = new Map(subjectRows.map((s) => [s.id, s.code]));
  const competencyCode = new Map(competencyRows.map((c) => [c.id, c.code]));

  return {
    levels: levelRows.map(({ code, title }) => ({ code, title })),
    subjects: subjectRows.map(({ code, title }) => ({ code, title })),
    competencies: competencyRows.map((c) => ({
      code: c.code,
      title: c.title,
      description: c.description,
      subject: subjectCode.get(c.subjectId)!,
      level: c.levelId ? levelCode.get(c.levelId)! : null,
      prerequisites: edgeRows
        .filter((e) => e.competencyId === c.id)
        .map((e) => competencyCode.get(e.prerequisiteId)!)
        .sort(),
    })),
  };
}
