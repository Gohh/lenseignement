import {
  CATALOG_PAGE_SIZE,
  type CatalogCourse,
  type CatalogCourseDetail,
  type CatalogLesson,
  type CatalogPage,
  type CatalogQuery,
} from '@lenseignement/types';
import { and, asc, desc, eq, exists, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import {
  competencies,
  courseModules,
  courses,
  courseVersionCompetencies,
  courseVersions,
  curricula,
  curriculumVersions,
  lessons,
  organizations,
} from '../db/schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Échappe les caractères spéciaux de LIKE : la recherche porte sur le texte saisi, tel quel. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const columns = {
  id: courses.id,
  versionId: courseVersions.id,
  versionNumber: courseVersions.number,
  title: courseVersions.title,
  summary: courseVersions.summary,
  audience: courseVersions.audience,
  language: courseVersions.language,
  licence: courseVersions.licence,
  estimatedMinutes: courseVersions.estimatedMinutes,
  branch: courses.branch,
  organization: organizations.name,
  curriculumCode: curricula.code,
  curriculumLabel: curriculumVersions.label,
  publishedAt: courseVersions.publishedAt,
};

/** Seules les versions publiées sont visibles (ADR-006, ADR-007). */
function published(db: Database) {
  return db
    .select(columns)
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .innerJoin(organizations, eq(organizations.id, courses.organizationId))
    .leftJoin(curriculumVersions, eq(curriculumVersions.id, courseVersions.curriculumVersionId))
    .leftJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId));
}

type Row = Awaited<ReturnType<ReturnType<typeof published>['execute']>>[number];

async function enrich(db: Database, rows: Row[]): Promise<CatalogCourse[]> {
  const versionIds = rows.map((r) => r.versionId);
  if (versionIds.length === 0) return [];
  const [linked, counts] = await Promise.all([
    db
      .select({
        versionId: courseVersionCompetencies.courseVersionId,
        code: competencies.code,
        title: competencies.title,
      })
      .from(courseVersionCompetencies)
      .innerJoin(competencies, eq(competencies.id, courseVersionCompetencies.competencyId))
      .where(inArray(courseVersionCompetencies.courseVersionId, versionIds))
      .orderBy(asc(competencies.position)),
    db
      .select({ versionId: lessons.courseVersionId, n: sql<number>`count(*)::int` })
      .from(lessons)
      .where(inArray(lessons.courseVersionId, versionIds))
      .groupBy(lessons.courseVersionId),
  ]);
  return rows.map((r) => ({
    id: r.id,
    versionNumber: r.versionNumber,
    title: r.title,
    summary: r.summary,
    audience: r.audience,
    language: r.language,
    estimatedMinutes: r.estimatedMinutes,
    branch: r.branch,
    organization: r.organization,
    curriculum:
      r.curriculumCode && r.curriculumLabel
        ? { code: r.curriculumCode, label: r.curriculumLabel }
        : null,
    competencies: linked
      .filter((l) => l.versionId === r.versionId)
      .map(({ code, title }) => ({ code, title })),
    lessonCount: counts.find((c) => c.versionId === r.versionId)?.n ?? 0,
    publishedAt: (r.publishedAt ?? new Date(0)).toISOString(),
  }));
}

export async function searchCatalog(db: Database, query: CatalogQuery): Promise<CatalogPage> {
  const scope: SQL[] = [eq(courseVersions.status, 'published')];
  if (query.branch) scope.push(eq(courses.branch, query.branch));

  const filters = [...scope];
  if (query.q) {
    const pattern = likePattern(query.q);
    filters.push(or(ilike(courseVersions.title, pattern), ilike(courseVersions.summary, pattern))!);
  }
  if (query.competency) {
    filters.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(courseVersionCompetencies)
          .innerJoin(competencies, eq(competencies.id, courseVersionCompetencies.competencyId))
          .where(
            and(
              eq(courseVersionCompetencies.courseVersionId, courseVersions.id),
              eq(competencies.code, query.competency),
            ),
          ),
      ),
    );
  }

  const offset = (query.page - 1) * CATALOG_PAGE_SIZE;
  const [rows, [total], facets] = await Promise.all([
    published(db)
      .where(and(...filters))
      .orderBy(desc(courseVersions.publishedAt), asc(courseVersions.title))
      .limit(CATALOG_PAGE_SIZE)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(courseVersions)
      .innerJoin(courses, eq(courses.id, courseVersions.courseId))
      .where(and(...filters)),
    db
      .selectDistinctOn([competencies.code], { code: competencies.code, title: competencies.title })
      .from(courseVersionCompetencies)
      .innerJoin(competencies, eq(competencies.id, courseVersionCompetencies.competencyId))
      .innerJoin(courseVersions, eq(courseVersions.id, courseVersionCompetencies.courseVersionId))
      .innerJoin(courses, eq(courses.id, courseVersions.courseId))
      .where(and(...scope))
      .orderBy(asc(competencies.code), asc(competencies.title)),
  ]);

  return {
    items: await enrich(db, rows),
    total: total?.n ?? 0,
    page: query.page,
    pageSize: CATALOG_PAGE_SIZE,
    competencies: facets,
  };
}

/** Fiche publique d'un cours : sa version publiée, ou rien (brouillons jamais exposés). */
export async function getCatalogCourse(
  db: Database,
  courseId: string,
): Promise<CatalogCourseDetail | null> {
  if (!UUID.test(courseId)) return null;
  const [row] = await published(db).where(
    and(eq(courseVersions.status, 'published'), eq(courses.id, courseId)),
  );
  if (!row) return null;
  const [[course], moduleRows, lessonRows] = await Promise.all([
    enrich(db, [row]),
    db
      .select()
      .from(courseModules)
      .where(eq(courseModules.courseVersionId, row.versionId))
      .orderBy(asc(courseModules.position)),
    db
      .select()
      .from(lessons)
      .where(eq(lessons.courseVersionId, row.versionId))
      .orderBy(asc(lessons.position)),
  ]);
  return {
    ...course!,
    licence: row.licence,
    modules: moduleRows.map((m) => ({
      title: m.title,
      lessons: lessonRows
        .filter((l) => l.moduleId === m.id)
        .map((l) => ({ title: l.title, estimatedMinutes: l.estimatedMinutes })),
    })),
  };
}

/** Leçon n° `number` (à partir de 1, dans l'ordre du plan) de la version publiée d'un cours. */
export async function getCatalogLesson(
  db: Database,
  courseId: string,
  number: number,
): Promise<CatalogLesson | null> {
  if (!UUID.test(courseId) || !Number.isInteger(number) || number < 1) return null;
  const [version] = await db
    .select({
      id: courseVersions.id,
      number: courseVersions.number,
      title: courseVersions.title,
      language: courseVersions.language,
    })
    .from(courseVersions)
    .where(and(eq(courseVersions.courseId, courseId), eq(courseVersions.status, 'published')));
  if (!version) return null;
  const ordered = await db
    .select({
      title: lessons.title,
      body: lessons.body,
      estimatedMinutes: lessons.estimatedMinutes,
      moduleTitle: courseModules.title,
      modulePosition: courseModules.position,
    })
    .from(lessons)
    .innerJoin(courseModules, eq(courseModules.id, lessons.moduleId))
    .where(eq(lessons.courseVersionId, version.id))
    .orderBy(asc(courseModules.position), asc(lessons.position));
  const lesson = ordered[number - 1];
  if (!lesson) return null;
  const modulePositions = [...new Set(ordered.map((l) => l.modulePosition))];
  return {
    courseId,
    courseTitle: version.title,
    versionNumber: version.number,
    language: version.language,
    number,
    total: ordered.length,
    module: {
      number: modulePositions.indexOf(lesson.modulePosition) + 1,
      title: lesson.moduleTitle,
    },
    title: lesson.title,
    body: lesson.body,
    estimatedMinutes: lesson.estimatedMinutes,
    previous: number > 1 ? number - 1 : null,
    next: number < ordered.length ? number + 1 : null,
  };
}
