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
  quizQuestions,
} from '../db/schema.js';

interface DemoQuestion {
  prompt: string;
  choices: string[];
  correct: number;
  explanation: string;
}

interface DemoCourse {
  courseId: string;
  versionId: string;
  author: string;
  title: string;
  summary: string;
  audience: string;
  estimatedMinutes: number;
  /** Espace et programme de démonstration (par défaut : primaire, DEMO-PRIMAIRE 2026). */
  branch?: 'primaire' | 'alphabetisation';
  curriculum?: string;
  competencyCodes: string[];
  module: string;
  lessons: Array<{ title: string; body: string; quiz?: DemoQuestion[] }>;
  /**
   * Étape du circuit de validation (ADR-006) : brouillon, envoyé en relecture par son auteur, ou
   * publié après approbation de Mme Mariam (référente) et publication par M. Bamba (directeur).
   */
  stage: 'draft' | 'in_review' | 'published';
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
    stage: 'draft',
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
    stage: 'in_review',
  },
  {
    courseId: ID.courseNombres,
    versionId: ID.courseNombresV1,
    author: ID.userKoffi,
    title: 'Les nombres jusqu’à 50 (démonstration)',
    summary: 'Cours fictif : compter, comparer et additionner avec des objets du quotidien.',
    audience: 'Élèves de CP1',
    estimatedMinutes: 30,
    competencyCodes: ['CALC-01', 'CALC-02'],
    module: 'Compter et additionner',
    lessons: [
      {
        title: 'Compter de 10 en 10',
        body: 'Avec des bâtonnets groupés par dix, compte : 10, 20, 30, 40, 50.',
      },
      {
        title: 'Additionner deux petits nombres',
        body: 'Trois cailloux et quatre cailloux : combien en tout ? Compte-les ensemble.',
      },
    ],
    stage: 'published',
  },
  {
    courseId: ID.courseMots,
    versionId: ID.courseMotsV1,
    author: ID.userAminata,
    title: 'Lire des mots courts (démonstration)',
    summary: 'Cours fictif : assembler des syllabes pour lire ses premiers mots.',
    audience: 'Élèves de CP1',
    estimatedMinutes: 20,
    competencyCodes: ['LECT-03'],
    module: 'Premiers mots',
    lessons: [{ title: 'Lire « papa » et « mama »', body: 'pa + pa : papa. ma + ma : mama.' }],
    stage: 'published',
  },
  {
    // Cours ajouté au ticket 13 pour montrer les quiz (les cours déjà publiés sont figés).
    courseId: ID.courseAdditions,
    versionId: ID.courseAdditionsV1,
    author: ID.userKoffi,
    title: 'Additionner jusqu’à 10 (démonstration)',
    summary: 'Cours fictif : petites additions avec des objets, et un quiz après chaque leçon.',
    audience: 'Élèves de CP1',
    estimatedMinutes: 20,
    competencyCodes: ['CALC-02'],
    module: 'Premières additions',
    lessons: [
      {
        title: 'Ajouter un objet',
        body: 'Deux mangues dans le panier. On en ajoute une : un, deux, trois. Il y a trois mangues.',
        quiz: [
          {
            prompt: 'Deux mangues et encore une mangue : combien de mangues en tout ?',
            choices: ['Deux', 'Trois', 'Quatre'],
            correct: 1,
            explanation: 'On compte deux, puis on ajoute un : trois mangues.',
          },
          {
            prompt: 'Quatre cailloux et encore un caillou : combien de cailloux en tout ?',
            choices: ['Cinq', 'Six', 'Trois'],
            correct: 0,
            explanation: 'Après quatre vient cinq : quatre et un font cinq.',
          },
        ],
      },
      {
        title: 'Additionner avec ses doigts',
        body: 'Montre trois doigts, puis encore deux doigts. Compte tous les doigts levés : cinq.',
        quiz: [
          {
            prompt: 'Trois doigts et encore deux doigts : combien de doigts levés ?',
            choices: ['Quatre', 'Cinq', 'Six'],
            correct: 1,
            explanation: 'Trois, puis quatre, cinq : trois et deux font cinq.',
          },
        ],
      },
    ],
    stage: 'published',
  },
  {
    // Cours ajouté au ticket 17 : le rattrapage en lecture a besoin d'un cours publié sur les
    // lettres et les syllabes (le cours « Lire ses premières syllabes » reste un brouillon).
    courseId: ID.courseLettres,
    versionId: ID.courseLettresV1,
    author: ID.userKoffi,
    title: 'Des lettres aux syllabes (démonstration)',
    summary: 'Cours fictif de rattrapage : revoir les lettres, puis les assembler en syllabes.',
    audience: 'Élèves de CP1 et CP2',
    estimatedMinutes: 20,
    competencyCodes: ['LECT-01', 'LECT-02'],
    module: 'Revoir et assembler',
    lessons: [
      {
        title: 'Revoir les lettres m, p, l',
        body: 'Le m a deux ponts. Le p a une canne qui descend. Le l est un grand bâton.',
      },
      {
        title: 'Assembler une consonne et une voyelle',
        body: 'On dit le son de la consonne, puis celui de la voyelle : l et a, la ; t et o, to.',
        quiz: [
          {
            prompt: 'p et a se lisent :',
            choices: ['ap', 'pa', 'po'],
            correct: 1,
            explanation: 'On lit d’abord le p, puis le a : pa.',
          },
        ],
      },
    ],
    stage: 'published',
  },
  {
    // Cours ajouté au ticket 19 : parcours « écouter d'abord » pour adultes (cahier §4.3
    // « marché-école »), phrases courtes, chaque texte s'écoute (ADR-015).
    courseId: ID.courseMarcheEcole,
    versionId: ID.courseMarcheEcoleV1,
    author: ID.userKoffi,
    title: 'Marché-école : l’argent du marché (démonstration)',
    summary: 'Cours fictif à écouter : reconnaître l’argent et rendre la monnaie.',
    audience: 'Adultes qui apprennent à lire et à compter (cours du soir)',
    estimatedMinutes: 20,
    branch: 'alphabetisation',
    curriculum: 'DEMO-ALPHA',
    competencyCodes: ['NOMB-01', 'NOMB-02'],
    module: 'Au marché',
    lessons: [
      {
        title: 'Les pièces et les billets',
        body: 'Au marché, on paie avec des pièces et des billets.\n🪙 La pièce de 100 francs est petite et ronde.\n💵 Le billet de 1 000 francs est en papier.\nDix pièces de 100 francs font 1 000 francs.',
        quiz: [
          {
            prompt: 'Combien de pièces de 100 francs font 1 000 francs ?',
            choices: ['5 pièces', '10 pièces', '20 pièces'],
            correct: 1,
            explanation: '100, 200, 300… jusqu’à 1 000 : il faut dix pièces.',
          },
        ],
      },
      {
        title: 'Rendre la monnaie',
        body: 'Les tomates coûtent 300 francs.\nLa cliente donne une pièce de 500 francs.\nLe vendeur rend 200 francs, car 300 et 200 font 500.',
        quiz: [
          {
            prompt: 'Les tomates coûtent 300 francs. Je donne 500 francs. Combien me rend-on ?',
            choices: ['100 francs', '200 francs', '300 francs'],
            correct: 1,
            explanation: '300 et 200 font 500 : on rend 200 francs.',
          },
          {
            prompt: 'Le pain coûte 150 francs. Je donne 200 francs. Combien me rend-on ?',
            choices: ['50 francs', '100 francs', '150 francs'],
            correct: 0,
            explanation: '150 et 50 font 200 : on rend 50 francs.',
          },
        ],
      },
    ],
    stage: 'published',
  },
];

/**
 * Cours FICTIFS de démonstration, à l'École Les Manguiers, reliés aux programmes de démonstration
 * 2026 : un brouillon, un cours en attente de relecture et cinq cours publiés (catalogue), dont
 * trois avec des quiz et un en alphabétisation. Idempotent.
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
        branch: demo.branch ?? 'primaire',
        createdBy: demo.author,
      })
      .onConflictDoNothing()
      .returning({ id: courses.id });
    if (inserted.length === 0) return;

    const [programme] = await tx
      .select({ id: curriculumVersions.id })
      .from(curriculumVersions)
      .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
      .where(
        and(
          eq(curricula.code, demo.curriculum ?? 'DEMO-PRIMAIRE'),
          eq(curriculumVersions.label, '2026'),
        ),
      );

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
    for (const [position, lesson] of demo.lessons.entries()) {
      const [created] = await tx
        .insert(lessons)
        .values({
          courseVersionId: demo.versionId,
          moduleId: module!.id,
          title: lesson.title,
          body: lesson.body,
          estimatedMinutes: 10,
          position,
        })
        .returning({ id: lessons.id });
      if (lesson.quiz) {
        await tx.insert(quizQuestions).values(
          lesson.quiz.map((q, questionPosition) => ({
            courseVersionId: demo.versionId,
            lessonId: created!.id,
            position: questionPosition,
            prompt: q.prompt,
            choices: q.choices,
            correctChoice: q.correct,
            explanation: q.explanation,
          })),
        );
      }
    }
    if (demo.stage === 'draft') return;
    // Les étapes passent par le déclencheur du circuit de validation, comme dans l'application.
    const step = (values: Partial<typeof courseVersions.$inferInsert>) =>
      tx.update(courseVersions).set(values).where(eq(courseVersions.id, demo.versionId));
    const record = (action: 'submitted' | 'approved' | 'published', actorUserId: string) =>
      tx
        .insert(courseReviewEvents)
        .values({ courseVersionId: demo.versionId, action, actorUserId });
    await step({ status: 'in_review', submittedBy: demo.author });
    await record('submitted', demo.author);
    if (demo.stage === 'published') {
      await step({ status: 'approved', approvedBy: ID.userMariam });
      await record('approved', ID.userMariam);
      await step({ status: 'published', publishedBy: ID.userBamba, publishedAt: new Date() });
      await record('published', ID.userBamba);
    }
  });
}
