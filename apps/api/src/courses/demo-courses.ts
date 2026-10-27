import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { DEMO_IDS as ID } from '../db/demo-data.js';
import {
  competencies,
  courseModules,
  courseReviewEvents,
  courses,
  courseVersionCompetencies,
  courseVersions,
  curricula,
  curriculumVersions,
  lessons,
} from '../db/schema.js';

interface DemoCourse {
  courseId: string;
  versionId: string;
  author: string;
  title: string;
  summary: string;
  audience: string;
  estimatedMinutes: number;
  competencyCodes: string[];
  module: string;
  lessons: Array<{ title: string; body: string }>;
  /** Envoyé en relecture par son auteur (circuit de validation, ADR-006). */
  submitted: boolean;
}

const DEMO_COURSES: DemoCourse[] = [
  {
    courseId: ID.courseSyllabes,
    versionId: ID.courseSyllabesV1,
    author: ID.userKoffi,
    title: 'Lire ses premières syllabes (démonstration)',
    summary: 'Cours fictif : des lettres aux syllabes, en petites activités de 10 minutes.',
    audience: 'Élèves de CP1',
    estimatedMinutes: 40,
    competencyCodes: ['LECT-01', 'LECT-02'],
    module: 'Les voyelles',
    lessons: [
      {
        title: 'Reconnaître le a et le i',
        body: 'Écoute, puis montre la lettre que tu entends : a… i… a.',
      },
      { title: 'Lire « ma » et « mi »', body: 'On assemble m et a : ma. Puis m et i : mi.' },
    ],
    submitted: false,
  },
  {
    courseId: ID.courseMarche,
    versionId: ID.courseMarcheV1,
    author: ID.userAminata,
    title: 'Compter au marché (démonstration)',
    summary: 'Cours fictif : compter des fruits et des pièces jusqu’à 50.',
    audience: 'Élèves de CP1',
    estimatedMinutes: 30,
    competencyCodes: ['CALC-01'],
    module: 'Compter les fruits',
    lessons: [
      {
        title: 'Compter les mangues par dizaines',
        body: 'Range les mangues par paquets de dix, puis compte les paquets : 10, 20, 30.',
      },
    ],
    submitted: true,
  },
];

/**
 * Cours FICTIFS de démonstration, à l'École Les Manguiers : un brouillon de M. Koffi et un cours
 * de Mme Aminata en attente de relecture, reliés au programme de démonstration 2026. Idempotent.
 */
export async function seedDemoCourses(db: Database): Promise<void> {
  for (const demo of DEMO_COURSES) {
    await seedCourse(db, demo);
  }
}

async function seedCourse(db: Database, demo: DemoCourse): Promise<void> {
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(courses)
      .values({
        id: demo.courseId,
        organizationId: ID.orgManguiers,
        branch: 'primaire',
        createdBy: demo.author,
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
      id: demo.versionId,
      courseId: demo.courseId,
      number: 1,
      title: demo.title,
      summary: demo.summary,
      audience: demo.audience,
      estimatedMinutes: demo.estimatedMinutes,
      curriculumVersionId: programme?.id ?? null,
      createdBy: demo.author,
    });
    if (programme) {
      const targets = await tx
        .select({ id: competencies.id })
        .from(competencies)
        .where(
          and(
            eq(competencies.versionId, programme.id),
            inArray(competencies.code, demo.competencyCodes),
          ),
        );
      await tx
        .insert(courseVersionCompetencies)
        .values(targets.map((t) => ({ courseVersionId: demo.versionId, competencyId: t.id })));
    }
    const [module] = await tx
      .insert(courseModules)
      .values({ courseVersionId: demo.versionId, title: demo.module, position: 0 })
      .returning({ id: courseModules.id });
    await tx.insert(lessons).values(
      demo.lessons.map((lesson, position) => ({
        courseVersionId: demo.versionId,
        moduleId: module!.id,
        title: lesson.title,
        body: lesson.body,
        estimatedMinutes: 10,
        position,
      })),
    );
    if (demo.submitted) {
      await tx
        .update(courseVersions)
        .set({ status: 'in_review', submittedBy: demo.author })
        .where(eq(courseVersions.id, demo.versionId));
      await tx.insert(courseReviewEvents).values({
        courseVersionId: demo.versionId,
        action: 'submitted',
        actorUserId: demo.author,
      });
    }
  });
}
