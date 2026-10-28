import {
  BRANCH_CODES,
  levelBranch,
  type AuthoringOrganization,
  type CourseDetail,
  type CourseOutlineInput,
  type CourseSummary,
  type CourseVersionDetail,
  type CourseVersionStatus,
  type CourseVersionSummary,
  type CreateCourseInput,
  type UpdateCourseVersionInput,
} from '@lenseignement/types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { authoringOrganizationIds } from '../access/access.service.js';
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
  quizQuestions,
  organizations,
} from '../db/schema.js';

/** Erreur métier sur les cours, traduite en 400, 403, 404 ou 409 par le contrôleur. */
export class CourseError extends Error {
  constructor(
    readonly kind: 'invalid' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summaryColumns = {
  id: courseVersions.id,
  number: courseVersions.number,
  status: courseVersions.status,
  title: courseVersions.title,
  revision: courseVersions.revision,
  updatedAt: courseVersions.updatedAt,
};

function toSummary(row: {
  id: string;
  number: number;
  status: string;
  title: string;
  revision: number;
  updatedAt: Date;
}): CourseVersionSummary {
  return {
    ...row,
    status: row.status as CourseVersionStatus,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Établissement responsable d'un cours ou d'une version, pour le contrôle d'accès. */
export async function organizationOfCourse(db: Database, courseId: string): Promise<string | null> {
  if (!UUID.test(courseId)) return null;
  const [row] = await db
    .select({ organizationId: courses.organizationId })
    .from(courses)
    .where(eq(courses.id, courseId));
  return row?.organizationId ?? null;
}

export async function organizationOfVersion(
  db: Database,
  versionId: string,
): Promise<string | null> {
  if (!UUID.test(versionId)) return null;
  const [row] = await db
    .select({ organizationId: courses.organizationId })
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .where(eq(courseVersions.id, versionId));
  return row?.organizationId ?? null;
}

/** Cycle d'un cours ou d'une version, pour le contrôle d'accès par cycle (ADR-019). */
export async function branchOfCourse(db: Database, courseId: string): Promise<string | null> {
  if (!UUID.test(courseId)) return null;
  const [row] = await db
    .select({ branch: courses.branch })
    .from(courses)
    .where(eq(courses.id, courseId));
  return row?.branch ?? null;
}

export async function branchOfVersion(db: Database, versionId: string): Promise<string | null> {
  if (!UUID.test(versionId)) return null;
  const [row] = await db
    .select({ branch: courses.branch })
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .where(eq(courseVersions.id, versionId));
  return row?.branch ?? null;
}

/** Établissements où la personne rédige, avec les cycles qui lui sont accordés dans chacun. */
export async function listAuthoringOrganizations(
  db: Database,
  userId: string,
): Promise<AuthoringOrganization[]> {
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(inArray(organizations.id, authoringOrganizationIds(userId)))
    .orderBy(asc(organizations.name));
  const perBranch = await Promise.all(
    BRANCH_CODES.map(async (code) => {
      const { rows } = await db.execute<{ id: string }>(
        sql`select id from ${authoringOrganizationIds(userId, code)} a`,
      );
      return { code, ids: new Set(rows.map((r) => r.id)) };
    }),
  );
  return orgs.map((o) => ({
    ...o,
    branches: perBranch.filter((b) => b.ids.has(o.id)).map((b) => b.code),
  }));
}

/** Cours des structures de la personne, avec leur dernière version. */
export async function listCourses(db: Database, userId: string): Promise<CourseSummary[]> {
  const rows = await db
    .select({
      id: courses.id,
      branch: courses.branch,
      organization: { id: organizations.id, name: organizations.name },
      latest: summaryColumns,
    })
    .from(courses)
    .innerJoin(organizations, eq(organizations.id, courses.organizationId))
    .innerJoin(
      courseVersions,
      and(
        eq(courseVersions.courseId, courses.id),
        eq(
          courseVersions.number,
          sql`(select max(cv.number) from course_versions cv where cv.course_id = ${courses.id})`,
        ),
      ),
    )
    .where(
      sql`${courses.organizationId} in ${authoringOrganizationIds(userId, sql`${courses.branch}`)}`,
    )
    .orderBy(desc(courseVersions.updatedAt));
  return rows.map((r) => ({ ...r, latest: toSummary(r.latest) }));
}

export async function createCourse(
  db: Database,
  userId: string,
  input: CreateCourseInput,
): Promise<{ courseId: string; versionId: string }> {
  return db.transaction(async (tx) => {
    const [course] = await tx
      .insert(courses)
      .values({ organizationId: input.organizationId, branch: input.branch, createdBy: userId })
      .returning({ id: courses.id });
    const [version] = await tx
      .insert(courseVersions)
      .values({
        courseId: course!.id,
        number: 1,
        title: input.title,
        summary: input.summary,
        createdBy: userId,
      })
      .returning({ id: courseVersions.id });
    return { courseId: course!.id, versionId: version!.id };
  });
}

export async function getCourse(db: Database, courseId: string): Promise<CourseDetail> {
  const [course] = await db
    .select({
      id: courses.id,
      branch: courses.branch,
      organization: { id: organizations.id, name: organizations.name },
    })
    .from(courses)
    .innerJoin(organizations, eq(organizations.id, courses.organizationId))
    .where(eq(courses.id, courseId));
  if (!course) throw new CourseError('not_found', 'Cours introuvable.');
  const versions = await db
    .select(summaryColumns)
    .from(courseVersions)
    .where(eq(courseVersions.courseId, courseId))
    .orderBy(desc(courseVersions.number));
  return { ...course, versions: versions.map(toSummary) };
}

export async function getCourseVersion(
  db: Executor,
  versionId: string,
): Promise<CourseVersionDetail> {
  const [row] = await db
    .select({
      version: courseVersions,
      branch: courses.branch,
      organization: { id: organizations.id, name: organizations.name },
      curriculumCode: curricula.code,
      curriculumLabel: curriculumVersions.label,
    })
    .from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .innerJoin(organizations, eq(organizations.id, courses.organizationId))
    .leftJoin(curriculumVersions, eq(curriculumVersions.id, courseVersions.curriculumVersionId))
    .leftJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .where(eq(courseVersions.id, versionId));
  if (!row) throw new CourseError('not_found', 'Version introuvable.');
  const v = row.version;

  const [linked, moduleRows, lessonRows, questionRows] = await Promise.all([
    db
      .select({ code: competencies.code, title: competencies.title })
      .from(courseVersionCompetencies)
      .innerJoin(competencies, eq(competencies.id, courseVersionCompetencies.competencyId))
      .where(eq(courseVersionCompetencies.courseVersionId, versionId))
      .orderBy(asc(competencies.position)),
    db
      .select()
      .from(courseModules)
      .where(eq(courseModules.courseVersionId, versionId))
      .orderBy(asc(courseModules.position)),
    db
      .select()
      .from(lessons)
      .where(eq(lessons.courseVersionId, versionId))
      .orderBy(asc(lessons.position)),
    db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.courseVersionId, versionId))
      .orderBy(asc(quizQuestions.position)),
  ]);

  return {
    ...toSummary(v),
    courseId: v.courseId,
    branch: row.branch,
    organization: row.organization,
    summary: v.summary,
    audience: v.audience,
    language: v.language,
    licence: v.licence,
    estimatedMinutes: v.estimatedMinutes,
    level: v.level,
    curriculum:
      row.curriculumCode && row.curriculumLabel
        ? { code: row.curriculumCode, label: row.curriculumLabel, competencies: linked }
        : null,
    modules: moduleRows.map((m) => ({
      title: m.title,
      lessons: lessonRows
        .filter((l) => l.moduleId === m.id)
        .map((l) => ({
          title: l.title,
          body: l.body,
          estimatedMinutes: l.estimatedMinutes,
          quiz: questionRows
            .filter((q) => q.lessonId === l.id)
            .map((q) => ({
              prompt: q.prompt,
              choices: q.choices,
              correct: q.correctChoice,
              explanation: q.explanation,
            })),
        })),
    })),
  };
}

/** Verrouille un brouillon et vérifie qu'il n'a pas changé depuis sa lecture. */
async function lockDraft(tx: Tx, versionId: string, revision: number) {
  const [version] = await tx
    .select()
    .from(courseVersions)
    .where(eq(courseVersions.id, versionId))
    .for('update');
  if (!version) throw new CourseError('not_found', 'Version introuvable.');
  if (version.status !== 'draft') {
    throw new CourseError(
      'conflict',
      'Cette version n’est plus un brouillon : créez une nouvelle version pour la modifier.',
    );
  }
  if (version.revision !== revision) {
    throw new CourseError(
      'conflict',
      'Ce brouillon a été modifié entre-temps. Rechargez la page pour voir la dernière version.',
    );
  }
  return version;
}

const bump = { revision: sql`${courseVersions.revision} + 1`, updatedAt: sql`now()` };

export async function updateCourseVersion(
  db: Database,
  versionId: string,
  input: UpdateCourseVersionInput,
): Promise<CourseVersionDetail> {
  return db.transaction(async (tx) => {
    const draft = await lockDraft(tx, versionId, input.revision);
    // `revision` est ensuite remplacée par l'incrément de `bump`.
    const { curriculum, ...fields } = input;

    if (fields.level) {
      const [course] = await tx
        .select({ branch: courses.branch })
        .from(courses)
        .where(eq(courses.id, draft.courseId));
      if (course?.branch !== levelBranch(fields.level)) {
        throw new CourseError('invalid', 'Ce niveau ne correspond pas à l’espace du cours.');
      }
    }

    let curriculumVersionId: string | null | undefined;
    let competencyIds: string[] = [];
    if (curriculum === null) {
      curriculumVersionId = null;
    } else if (curriculum) {
      const [target] = await tx
        .select({ id: curriculumVersions.id })
        .from(curriculumVersions)
        .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
        .where(
          and(
            eq(curricula.code, curriculum.code),
            eq(curriculumVersions.label, curriculum.label),
            eq(curriculumVersions.status, 'published'),
          ),
        );
      if (!target) {
        throw new CourseError(
          'invalid',
          `Programme publié introuvable : ${curriculum.code} ${curriculum.label}.`,
        );
      }
      curriculumVersionId = target.id;
      const codes = [...new Set(curriculum.competencyCodes)];
      const found =
        codes.length === 0
          ? []
          : await tx
              .select({ id: competencies.id, code: competencies.code })
              .from(competencies)
              .where(and(eq(competencies.versionId, target.id), inArray(competencies.code, codes)));
      const missing = codes.filter((c) => !found.some((f) => f.code === c));
      if (missing.length > 0) {
        throw new CourseError(
          'invalid',
          `Compétences absentes de ce programme : ${missing.join(', ')}.`,
        );
      }
      competencyIds = found.map((f) => f.id);
    }

    await tx
      .update(courseVersions)
      .set({
        ...fields,
        ...(curriculumVersionId !== undefined ? { curriculumVersionId } : {}),
        ...bump,
      })
      .where(eq(courseVersions.id, versionId));
    if (curriculumVersionId !== undefined) {
      await tx
        .delete(courseVersionCompetencies)
        .where(eq(courseVersionCompetencies.courseVersionId, versionId));
      if (competencyIds.length > 0) {
        await tx
          .insert(courseVersionCompetencies)
          .values(
            competencyIds.map((competencyId) => ({ courseVersionId: versionId, competencyId })),
          );
      }
    }
    return getCourseVersion(tx, versionId);
  });
}

async function insertOutline(tx: Tx, versionId: string, modules: CourseOutlineInput['modules']) {
  for (const [position, module] of modules.entries()) {
    const [inserted] = await tx
      .insert(courseModules)
      .values({ courseVersionId: versionId, title: module.title, position })
      .returning({ id: courseModules.id });
    for (const [lessonPosition, lesson] of module.lessons.entries()) {
      const [created] = await tx
        .insert(lessons)
        .values({
          courseVersionId: versionId,
          moduleId: inserted!.id,
          title: lesson.title,
          body: lesson.body,
          estimatedMinutes: lesson.estimatedMinutes,
          position: lessonPosition,
        })
        .returning({ id: lessons.id });
      if (lesson.quiz.length > 0) {
        await tx.insert(quizQuestions).values(
          lesson.quiz.map((q, position) => ({
            courseVersionId: versionId,
            lessonId: created!.id,
            position,
            prompt: q.prompt,
            choices: q.choices,
            correctChoice: q.correct,
            explanation: q.explanation,
          })),
        );
      }
    }
  }
}

/** Remplace le plan complet (modules et leçons) d'un brouillon. */
export async function replaceOutline(
  db: Database,
  versionId: string,
  input: CourseOutlineInput,
): Promise<CourseVersionDetail> {
  return db.transaction(async (tx) => {
    await lockDraft(tx, versionId, input.revision);
    await tx.delete(quizQuestions).where(eq(quizQuestions.courseVersionId, versionId));
    await tx.delete(lessons).where(eq(lessons.courseVersionId, versionId));
    await tx.delete(courseModules).where(eq(courseModules.courseVersionId, versionId));
    await insertOutline(tx, versionId, input.modules);
    await tx.update(courseVersions).set(bump).where(eq(courseVersions.id, versionId));
    return getCourseVersion(tx, versionId);
  });
}

/** Crée un brouillon à partir de la dernière version (une seule version en cours à la fois). */
export async function createNextVersion(
  db: Database,
  courseId: string,
  userId: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for('update');
    const [latest] = await tx
      .select()
      .from(courseVersions)
      .where(eq(courseVersions.courseId, courseId))
      .orderBy(desc(courseVersions.number))
      .limit(1);
    if (!latest) throw new CourseError('not_found', 'Cours introuvable.');
    if (latest.status === 'draft') {
      throw new CourseError('conflict', 'Ce cours a déjà un brouillon en cours : modifiez-le.');
    }
    if (latest.status === 'in_review' || latest.status === 'approved') {
      throw new CourseError(
        'conflict',
        'Une version de ce cours est en cours de validation : attendez sa publication.',
      );
    }
    const source = await getCourseVersion(tx, latest.id);
    const [created] = await tx
      .insert(courseVersions)
      .values({
        courseId,
        number: latest.number + 1,
        title: latest.title,
        summary: latest.summary,
        audience: latest.audience,
        language: latest.language,
        licence: latest.licence,
        estimatedMinutes: latest.estimatedMinutes,
        level: latest.level,
        curriculumVersionId: latest.curriculumVersionId,
        createdBy: userId,
      })
      .returning({ id: courseVersions.id });
    const versionId = created!.id;
    await tx.execute(sql`
      insert into course_version_competencies (course_version_id, competency_id)
      select ${versionId}, competency_id from course_version_competencies
       where course_version_id = ${latest.id}`);
    await insertOutline(tx, versionId, source.modules);
    return versionId;
  });
}

/** Supprime un brouillon qui n'est pas la première version du cours. */
export async function deleteDraft(db: Database, versionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(courseVersions)
      .where(eq(courseVersions.id, versionId))
      .for('update');
    if (!version) throw new CourseError('not_found', 'Version introuvable.');
    if (version.status !== 'draft') {
      throw new CourseError('conflict', 'Seul un brouillon peut être supprimé.');
    }
    if (version.number === 1) {
      throw new CourseError(
        'conflict',
        'La première version d’un cours ne peut pas être supprimée.',
      );
    }
    await tx
      .delete(courseVersionCompetencies)
      .where(eq(courseVersionCompetencies.courseVersionId, versionId));
    await tx.delete(quizQuestions).where(eq(quizQuestions.courseVersionId, versionId));
    await tx.delete(lessons).where(eq(lessons.courseVersionId, versionId));
    await tx.delete(courseModules).where(eq(courseModules.courseVersionId, versionId));
    await tx.delete(courseVersions).where(eq(courseVersions.id, versionId));
  });
}
