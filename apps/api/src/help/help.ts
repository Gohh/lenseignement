import type { AskHelp, HelpBadge, HelpInboxItem, HelpQuestion } from '@lenseignement/types';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { myAssignments } from '../assignments/assignments.js';
import type { Database } from '../db/database.js';
import { unreadMessages } from '../messages/messages.js';
import { mySessions } from '../sessions/class-sessions.js';
import {
  cohortMembers,
  cohorts,
  courses,
  helpQuestions,
  memberships,
  tutorLinks,
} from '../db/schema.js';

export class HelpError extends Error {
  constructor(
    readonly kind: 'not_found' | 'forbidden' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Élèves dont une personne reçoit les questions : ceux de ses classes (enseignant), ceux qui lui
 * sont confiés (répétiteur au lien actif) et ceux des classes de l'établissement dont elle est
 * chef (direction). Les administrateurs voient celles de tous les élèves.
 */
export async function helpedLearnerIds(db: Database, userId: string): Promise<string[]> {
  // L'équipe de la plateforme voit toutes les questions, y compris celles d'élèves sans classe.
  const [admin] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        inArray(memberships.role, ['superadministrateur', 'administrateur']),
        or(isNull(memberships.validUntil), sql`${memberships.validUntil} > now()`),
      ),
    )
    .limit(1);
  if (admin) {
    const asked = await db.selectDistinct({ id: helpQuestions.learnerUserId }).from(helpQuestions);
    return asked.map((r) => r.id).filter((id) => id !== userId);
  }
  const mine = db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.role, 'enseignant')));
  const direction = db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, 'chef-etablissement'),
        or(isNull(memberships.validUntil), sql`${memberships.validUntil} > now()`),
      ),
    );
  const [byClass, byTutor, byDirection] = await Promise.all([
    db
      .selectDistinct({ id: cohortMembers.userId })
      .from(cohortMembers)
      .where(and(eq(cohortMembers.role, 'apprenant'), inArray(cohortMembers.cohortId, mine))),
    db
      .select({ id: tutorLinks.learnerUserId })
      .from(tutorLinks)
      .where(and(eq(tutorLinks.tutorUserId, userId), eq(tutorLinks.status, 'active'))),
    db
      .selectDistinct({ id: cohortMembers.userId })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
      .where(and(eq(cohortMembers.role, 'apprenant'), inArray(cohorts.organizationId, direction))),
  ]);
  const ids = new Set([...byClass, ...byTutor, ...byDirection].map((r) => r.id));
  ids.delete(userId);
  return [...ids];
}

const courseTitle = sql<string | null>`(
  select cv.title from course_versions cv where cv.course_id = ${helpQuestions.courseId}
  order by (cv.status = 'published') desc, cv.created_at desc limit 1
)`;

function view(row: {
  id: string;
  kind: HelpQuestion['kind'];
  body: string;
  courseId: string | null;
  courseTitle: string | null;
  lessonNumber: number | null;
  answer: string | null;
  answeredByName: string | null;
  answeredAt: Date | null;
  learnerSeenAt: Date | null;
  createdAt: Date;
}): HelpQuestion {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    lessonNumber: row.lessonNumber,
    status: row.answer === null ? 'open' : 'answered',
    answer: row.answer,
    answeredByName: row.answeredByName,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    unseen: row.answer !== null && row.learnerSeenAt === null,
  };
}

const answeredByName = sql<
  string | null
>`(select u.display_name from users u where u.id = ${helpQuestions.answeredByUserId})`;

const columns = {
  id: helpQuestions.id,
  kind: helpQuestions.kind,
  body: helpQuestions.body,
  courseId: helpQuestions.courseId,
  courseTitle,
  lessonNumber: helpQuestions.lessonNumber,
  answer: helpQuestions.answer,
  answeredByName,
  answeredAt: helpQuestions.answeredAt,
  learnerSeenAt: helpQuestions.learnerSeenAt,
  createdAt: helpQuestions.createdAt,
};

/** Une question de l'apprenant. */
export async function askHelp(
  db: Database,
  learnerId: string,
  input: AskHelp,
): Promise<{ id: string }> {
  if (input.courseId) {
    const [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, input.courseId));
    if (!course) throw new HelpError('not_found', 'Cours introuvable.');
  }
  const [row] = await db
    .insert(helpQuestions)
    .values({
      learnerUserId: learnerId,
      kind: input.kind,
      body: input.body,
      courseId: input.courseId ?? null,
      lessonNumber: input.courseId ? (input.lessonNumber ?? null) : null,
    })
    .returning({ id: helpQuestions.id });
  return { id: row!.id };
}

/** Questions de l'apprenant, les plus récentes d'abord. */
export async function myQuestions(db: Database, learnerId: string): Promise<HelpQuestion[]> {
  const rows = await db
    .select(columns)
    .from(helpQuestions)
    .where(eq(helpQuestions.learnerUserId, learnerId))
    .orderBy(desc(helpQuestions.createdAt));
  return rows.map(view);
}

/** L'apprenant a lu ses réponses : la cloche s'éteint. */
export async function markAnswersSeen(db: Database, learnerId: string): Promise<void> {
  await db
    .update(helpQuestions)
    .set({ learnerSeenAt: sql`now()` })
    .where(
      and(
        eq(helpQuestions.learnerUserId, learnerId),
        isNull(helpQuestions.learnerSeenAt),
        sql`${helpQuestions.answer} is not null`,
      ),
    );
}

/** Questions des élèves d'une personne : celles en attente d'abord, les plus anciennes en tête. */
export async function inbox(db: Database, userId: string): Promise<HelpInboxItem[]> {
  const learners = await helpedLearnerIds(db, userId);
  if (learners.length === 0) return [];
  const rows = await db
    .select({
      ...columns,
      learnerName: sql<
        string | null
      >`(select u.display_name from users u where u.id = ${helpQuestions.learnerUserId})`,
    })
    .from(helpQuestions)
    .where(inArray(helpQuestions.learnerUserId, learners))
    .orderBy(sql`(${helpQuestions.answer} is not null)`, helpQuestions.createdAt)
    .limit(200);
  return rows.map((row) => ({ ...view(row), learnerName: row.learnerName ?? 'Élève' }));
}

export async function answerHelp(
  db: Database,
  userId: string,
  questionId: string,
  answer: string,
): Promise<void> {
  const [question] = await db
    .select({ learnerUserId: helpQuestions.learnerUserId, answer: helpQuestions.answer })
    .from(helpQuestions)
    .where(eq(helpQuestions.id, questionId));
  if (!question) throw new HelpError('not_found', 'Question introuvable.');
  const learners = await helpedLearnerIds(db, userId);
  if (!learners.includes(question.learnerUserId)) {
    throw new HelpError('forbidden', 'Cette question n’est pas dans votre périmètre.');
  }
  if (question.answer !== null)
    throw new HelpError('invalid', 'Cette question a déjà une réponse.');
  await db
    .update(helpQuestions)
    .set({ answer, answeredByUserId: userId, answeredAt: sql`now()`, learnerSeenAt: null })
    .where(eq(helpQuestions.id, questionId));
}

/** Chiffres de la cloche : réponses à lire et questions en attente. */
export async function badge(db: Database, userId: string): Promise<HelpBadge> {
  const [mine] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(helpQuestions)
    .where(
      and(
        eq(helpQuestions.learnerUserId, userId),
        isNull(helpQuestions.learnerSeenAt),
        sql`${helpQuestions.answer} is not null`,
      ),
    );
  const learners = await helpedLearnerIds(db, userId);
  let questions = 0;
  if (learners.length > 0) {
    const [open] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(helpQuestions)
      .where(and(inArray(helpQuestions.learnerUserId, learners), isNull(helpQuestions.answer)));
    questions = open?.n ?? 0;
  }
  const assignments = await myAssignments(db, userId);
  const homework = assignments.filter((a) => !a.canManage && !a.mine).length;
  const toGrade = assignments
    .filter((a) => a.canManage)
    .reduce((sum, a) => sum + (a.submittedCount - a.gradedCount), 0);
  const now = Date.now();
  const sessions = (await mySessions(db, userId)).filter(
    (x) => Date.parse(x.endsAt) >= now && Date.parse(x.startsAt) <= now + 24 * 3600_000,
  ).length;
  return {
    answers: mine?.n ?? 0,
    questions,
    homework,
    toGrade,
    sessions,
    messages: await unreadMessages(db, userId),
  };
}
