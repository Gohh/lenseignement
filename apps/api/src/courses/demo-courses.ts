import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { DEMO_IDS as ID } from '../db/demo-data.js';
import {
  competencies,
  courseModules,
  courses,
  courseVersionCompetencies,
  courseVersions,
  curricula,
  curriculumVersions,
  lessons,
} from '../db/schema.js';

/**
 * Cours FICTIF de démonstration : un brouillon de M. Koffi (École Les Manguiers), relié aux
 * compétences de lecture du programme de démonstration 2026. Idempotent.
 */
export async function seedDemoCourses(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(courses)
      .values({
        id: ID.courseSyllabes,
        organizationId: ID.orgManguiers,
        branch: 'primaire',
        createdBy: ID.userKoffi,
      })
      .onConflictDoNothing()
      .returning({ id: courses.id });
    if (inserted.length === 0) return;

    const [programme] = await tx
      .select({ id: curriculumVersions.id })
      .from(curriculumVersions)
      .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
      .where(and(eq(curricula.code, 'DEMO-PRIMAIRE'), eq(curriculumVersions.label, '2026')));

    await tx.insert(courseVersions).values({
      id: ID.courseSyllabesV1,
      courseId: ID.courseSyllabes,
      number: 1,
      title: 'Lire ses premières syllabes (démonstration)',
      summary: 'Cours fictif : des lettres aux syllabes, en petites activités de 10 minutes.',
      audience: 'Élèves de CP1',
      estimatedMinutes: 40,
      curriculumVersionId: programme?.id ?? null,
      createdBy: ID.userKoffi,
    });
    if (programme) {
      const targets = await tx
        .select({ id: competencies.id })
        .from(competencies)
        .where(
          and(
            eq(competencies.versionId, programme.id),
            inArray(competencies.code, ['LECT-01', 'LECT-02']),
          ),
        );
      await tx
        .insert(courseVersionCompetencies)
        .values(targets.map((t) => ({ courseVersionId: ID.courseSyllabesV1, competencyId: t.id })));
    }
    const [module] = await tx
      .insert(courseModules)
      .values({ courseVersionId: ID.courseSyllabesV1, title: 'Les voyelles', position: 0 })
      .returning({ id: courseModules.id });
    await tx.insert(lessons).values([
      {
        courseVersionId: ID.courseSyllabesV1,
        moduleId: module!.id,
        title: 'Reconnaître le a et le i',
        body: 'Écoute, puis montre la lettre que tu entends : a… i… a.',
        estimatedMinutes: 10,
        position: 0,
      },
      {
        courseVersionId: ID.courseSyllabesV1,
        moduleId: module!.id,
        title: 'Lire « ma » et « mi »',
        body: 'On assemble m et a : ma. Puis m et i : mi.',
        estimatedMinutes: 10,
        position: 1,
      },
    ]);
  });
}
