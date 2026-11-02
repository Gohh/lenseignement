import {
  EXERCISE_DIFFICULTIES,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_DOMAINS,
  EXERCISE_SKILL_LABELS,
  EXERCISE_SKILLS,
  exercisePlay,
  GAP,
  type AssignmentExerciseResult,
  type CreateExamInput,
  type ExamBooklet,
  type ExamDetail,
  type ExamGiven,
  type ExamItem,
  type ExamModel,
  type ExamPaperSheet,
  type ExamPlanRow,
  type ExamRate,
  type ExamResults,
  type ExamSummary,
  type ExerciseDifficulty,
  type ExerciseDomain,
  type ExerciseKind,
  type ExerciseSkill,
  type ExerciseContent,
  type GiveExamInput,
  type SaveExamPaperInput,
  type UpdateExamInput,
} from '@lenseignement/types';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { createAssignment } from '../assignments/assignments.js';
import type { Database, Executor } from '../db/database.js';
import {
  assignmentExercises,
  assignments,
  assignmentSubmissions,
  auditLogs,
  cohortMembers,
  cohorts,
  competencies,
  curricula,
  curriculumVersions,
  examItems,
  exams,
  exercises,
  organizations,
  users,
} from '../db/schema.js';
import { ExerciseError, powers, type Powers } from '../exercises/exercises.js';
import { canManageCohort } from '../sessions/class-sessions.js';
import { TeamError } from '../team/team.js';

/**
 * Épreuves « type PASEC, TIMSS, ENIA » (étape 4a, choix validés par GOHH le 02/11/2026). Un auteur
 * d'exercices compose une épreuve pour sa structure : la plateforme tire des exercices PUBLIÉS de la
 * banque selon les parts par domaine du modèle, l'auteur remplace ou retire des questions, puis la
 * donne à ses classes. Chaque classe reçoit un devoir fait de ces exercices (en ligne ou sans
 * connexion, comme les devoirs de la Fabrique) ; la note est visible tout de suite. Une fois donnée,
 * l'épreuve garde ses questions, pour que toutes les classes passent la même.
 */

const NOT_FOUND = 'Épreuve introuvable.';
const DIFFICULTY_ORDER: Record<string, number> = { facile: 0, moyen: 1, difficile: 2 };

async function audit(db: Executor, userId: string, action: string, id: string, traceId?: string) {
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action,
    resourceType: 'exam',
    resourceId: id,
    decision: 'allow',
    reason: 'epreuves',
    traceId,
  });
}

type ExamRow = typeof exams.$inferSelect;

function canEdit(row: ExamRow, p: Powers): boolean {
  return p.superadmin || p.authorOrgIds.has(row.organizationId);
}

function visible(userId: string, p: Powers): SQL | undefined {
  if (p.superadmin) return undefined;
  const ids = [...p.authorOrgIds, ...p.publisherOrgIds];
  return ids.length
    ? sql`(${inArray(exams.organizationId, ids)} or ${exams.authorId} = ${userId})`
    : eq(exams.authorId, userId);
}

async function load(db: Executor, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ExerciseError('not_found', NOT_FOUND);
  const p = await powers(db, userId);
  const where = visible(userId, p);
  const [row] = await db
    .select()
    .from(exams)
    .where(where ? and(eq(exams.id, id), where) : eq(exams.id, id));
  if (!row) throw new ExerciseError('not_found', NOT_FOUND);
  return { row, p };
}

async function loadForEdit(db: Executor, userId: string, id: string) {
  const loaded = await load(db, userId, id);
  if (!canEdit(loaded.row, loaded.p)) {
    throw new ExerciseError(
      'forbidden',
      'Seuls les auteurs de cette structure modifient l’épreuve.',
    );
  }
  return loaded;
}

async function isGiven(db: Executor, examId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.examId, examId), isNull(assignments.campaignId)))
    .limit(1);
  return Boolean(row);
}

async function assertQuestionsOpen(db: Executor, examId: string) {
  if (await isGiven(db, examId)) {
    throw new ExerciseError(
      'conflict',
      'Cette épreuve est déjà donnée : ses questions ne changent plus, pour que toutes les classes passent la même.',
    );
  }
}

/** Répartit `total` questions selon les parts (méthode du plus fort reste). */
export function splitByShares(
  shares: Partial<Record<ExerciseDomain, number>>,
  total: number,
): Partial<Record<ExerciseDomain, number>> {
  const entries = EXERCISE_DOMAINS.map((d) => [d, shares[d] ?? 0] as const).filter(
    ([, v]) => v > 0,
  );
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum === 0) return {};
  const raw = entries.map(([d, v]) => ({ d, exact: (v / sum) * total }));
  const out: Partial<Record<ExerciseDomain, number>> = {};
  let given = 0;
  for (const r of raw) {
    out[r.d] = Math.floor(r.exact);
    given += out[r.d]!;
  }
  const byRest = [...raw].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  );
  for (let i = 0; given < total && i < byRest.length; i++, given++) out[byRest[i]!.d]! += 1;
  return out;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

interface PoolRow {
  id: string;
  domain: string;
  difficulty: string;
}

/** Exercices publiés du même programme (toutes ses versions), dans les domaines demandés. */
async function pool(db: Executor, exam: ExamRow, domains: string[]): Promise<PoolRow[]> {
  if (domains.length === 0) return [];
  return db
    .select({ id: exercises.id, domain: exercises.domain, difficulty: exercises.difficulty })
    .from(exercises)
    .innerJoin(competencies, eq(competencies.id, exercises.competencyId))
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .where(
      and(
        eq(exercises.status, 'published'),
        inArray(exercises.domain, domains),
        sql`${curriculumVersions.curriculumId} = (
          select cv.curriculum_id from curriculum_versions cv where cv.id = ${exam.curriculumVersionId})`,
      ),
    );
}

/** Choisit les questions : par domaine, en alternant facile / moyen / difficile. */
async function assemble(db: Executor, exam: ExamRow): Promise<void> {
  const targets = splitByShares(
    exam.shares as Partial<Record<ExerciseDomain, number>>,
    exam.questionCount,
  );
  const domains = Object.keys(targets);
  const rows = await pool(db, exam, domains);
  const chosen: PoolRow[] = [];
  for (const domain of EXERCISE_DOMAINS) {
    const want = targets[domain] ?? 0;
    if (want === 0) continue;
    const byLevel = EXERCISE_DIFFICULTIES.map((level) =>
      shuffle(rows.filter((r) => r.domain === domain && r.difficulty === level)),
    );
    const picked: PoolRow[] = [];
    while (picked.length < want && byLevel.some((l) => l.length > 0)) {
      for (const level of byLevel) {
        if (picked.length >= want) break;
        const next = level.shift();
        if (next) picked.push(next);
      }
    }
    picked.sort((a, b) => DIFFICULTY_ORDER[a.difficulty]! - DIFFICULTY_ORDER[b.difficulty]!);
    chosen.push(...picked);
  }
  await db.delete(examItems).where(eq(examItems.examId, exam.id));
  if (chosen.length) {
    await db
      .insert(examItems)
      .values(chosen.map((c, position) => ({ examId: exam.id, exerciseId: c.id, position })));
  }
}

async function items(db: Executor, examId: string): Promise<ExamItem[]> {
  const rows = await db
    .select({
      exerciseId: exercises.id,
      position: examItems.position,
      title: exercises.title,
      kind: exercises.kind,
      domain: exercises.domain,
      difficulty: exercises.difficulty,
      skill: exercises.skill,
      competencyCode: competencies.code,
    })
    .from(examItems)
    .innerJoin(exercises, eq(exercises.id, examItems.exerciseId))
    .innerJoin(competencies, eq(competencies.id, exercises.competencyId))
    .where(eq(examItems.examId, examId))
    .orderBy(asc(examItems.position));
  return rows.map((r, i) => ({
    ...r,
    position: i + 1,
    kind: r.kind as ExerciseKind,
    domain: r.domain as ExerciseDomain,
    difficulty: r.difficulty as ExerciseDifficulty,
    skill: r.skill as ExerciseSkill,
  }));
}

const summaryColumns = {
  exam: exams,
  organization: { id: organizations.id, name: organizations.name },
  curriculum: sql<string>`${curricula.title} || ' (' || ${curriculumVersions.label} || ')'`,
  author: users.displayName,
  itemCount: sql<number>`(select count(*)::int from exam_items i where i.exam_id = ${exams.id})`,
  classCount: sql<number>`(select count(*)::int from assignments a where a.exam_id = ${exams.id})`,
  submissionCount: sql<number>`(select count(*)::int from assignment_submissions s
    join assignments a on a.id = s.assignment_id where a.exam_id = ${exams.id})`,
};

function summaryQuery(db: Executor) {
  return db
    .select(summaryColumns)
    .from(exams)
    .innerJoin(organizations, eq(organizations.id, exams.organizationId))
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, exams.curriculumVersionId))
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .leftJoin(users, eq(users.id, exams.authorId));
}

type SummaryRow = Awaited<ReturnType<ReturnType<typeof summaryQuery>['where']>>[number];

function toSummary(r: SummaryRow): ExamSummary {
  return {
    id: r.exam.id,
    title: r.exam.title,
    model: r.exam.model as ExamModel,
    organization: r.organization,
    curriculum: r.curriculum,
    questionCount: r.exam.questionCount,
    itemCount: r.itemCount,
    durationMinutes: r.exam.durationMinutes,
    threshold: r.exam.threshold,
    author: r.author,
    classCount: r.classCount,
    submissionCount: r.submissionCount,
    createdAt: r.exam.createdAt.toISOString(),
  };
}

export async function listExams(db: Database, userId: string): Promise<ExamSummary[]> {
  const p = await powers(db, userId);
  const rows = await summaryQuery(db)
    .where(visible(userId, p))
    .orderBy(desc(exams.createdAt))
    .limit(200);
  return rows.map(toSummary);
}

export async function createExam(
  db: Database,
  userId: string,
  input: CreateExamInput,
  traceId?: string,
): Promise<{ id: string }> {
  const p = await powers(db, userId);
  if (!p.superadmin && !p.authorOrgIds.has(input.organizationId)) {
    throw new ExerciseError('forbidden', 'Vous ne rédigez pas pour cette structure.');
  }
  const [version] = await db
    .select({ id: curriculumVersions.id })
    .from(curriculumVersions)
    .where(
      and(
        eq(curriculumVersions.id, input.curriculumVersionId),
        eq(curriculumVersions.status, 'published'),
      ),
    );
  if (!version) throw new ExerciseError('invalid', 'Choisissez un programme publié.');
  const [row] = await db
    .insert(exams)
    .values({
      organizationId: input.organizationId,
      authorId: userId,
      title: input.title,
      model: input.model,
      curriculumVersionId: input.curriculumVersionId,
      shares: input.shares,
      questionCount: input.questionCount,
      durationMinutes: input.durationMinutes,
      threshold: input.threshold,
    })
    .returning();
  await assemble(db, row!);
  await audit(db, userId, 'exam.create', row!.id, traceId);
  return { id: row!.id };
}

async function given(db: Executor, examId: string): Promise<ExamGiven[]> {
  const rows = await db
    .select({
      assignmentId: assignments.id,
      cohortId: cohorts.id,
      cohortName: cohorts.name,
      dueAt: assignments.dueAt,
      learnerCount: sql<number>`(select count(*)::int from cohort_members cm
        where cm.cohort_id = ${cohorts.id} and cm.role = 'apprenant')`,
      submissionCount: sql<number>`(select count(*)::int from assignment_submissions s
        where s.assignment_id = ${assignments.id})`,
      onPaper: assignments.onPaper,
    })
    .from(assignments)
    .innerJoin(cohorts, eq(cohorts.id, assignments.cohortId))
    .where(eq(assignments.examId, examId))
    .orderBy(asc(cohorts.name));
  return rows.map((r) => ({ ...r, dueAt: r.dueAt?.toISOString() ?? null }));
}

export async function getExam(db: Database, userId: string, id: string): Promise<ExamDetail> {
  const { row, p } = await load(db, userId, id);
  const [summary] = await summaryQuery(db).where(eq(exams.id, id));
  const list = await items(db, id);
  const shares = row.shares as Partial<Record<ExerciseDomain, number>>;
  const targets = splitByShares(shares, row.questionCount);
  const domains = Object.keys(targets);
  const available = await pool(db, row, domains);
  const plan: ExamPlanRow[] = EXERCISE_DOMAINS.filter((d) => (targets[d] ?? 0) > 0).map((d) => ({
    domain: d,
    share: shares[d] ?? 0,
    target: targets[d] ?? 0,
    chosen: list.filter((i) => i.domain === d).length,
    available: available.filter((a) => a.domain === d).length,
  }));
  const givenTo = await given(db, id);
  const mine: ExamGiven[] = [];
  for (const g of givenTo) {
    if (p.superadmin || (await canManageCohort(db, userId, g.cohortId))) mine.push(g);
  }
  return {
    ...toSummary(summary!),
    shares,
    plan,
    items: list,
    given: mine,
    locked: await isGiven(db, id),
    canEdit: canEdit(row, p),
  };
}

export async function updateExam(
  db: Database,
  userId: string,
  id: string,
  input: UpdateExamInput,
  traceId?: string,
): Promise<void> {
  await loadForEdit(db, userId, id);
  await db
    .update(exams)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(exams.id, id));
  await audit(db, userId, 'exam.update', id, traceId);
}

export async function reassembleExam(
  db: Database,
  userId: string,
  id: string,
  traceId?: string,
): Promise<void> {
  const { row } = await loadForEdit(db, userId, id);
  await assertQuestionsOpen(db, id);
  await assemble(db, row);
  await audit(db, userId, 'exam.assemble', id, traceId);
}

/** Remplace une question par une autre du même domaine (de préférence la même difficulté). */
export async function replaceExamItem(
  db: Database,
  userId: string,
  id: string,
  exerciseId: string,
  traceId?: string,
): Promise<void> {
  const { row } = await loadForEdit(db, userId, id);
  await assertQuestionsOpen(db, id);
  const list = await items(db, id);
  const current = list.find((i) => i.exerciseId === exerciseId);
  if (!current) throw new ExerciseError('not_found', 'Question introuvable dans l’épreuve.');
  const taken = new Set(list.map((i) => i.exerciseId));
  const others = (await pool(db, row, [current.domain])).filter((r) => !taken.has(r.id));
  const sameLevel = others.filter((r) => r.difficulty === current.difficulty);
  const next = shuffle(sameLevel.length ? sameLevel : others)[0];
  if (!next) {
    throw new ExerciseError(
      'invalid',
      `Aucun autre exercice publié en « ${EXERCISE_DOMAIN_LABELS[current.domain]} » pour ce programme.`,
    );
  }
  await db
    .update(examItems)
    .set({ exerciseId: next.id })
    .where(and(eq(examItems.examId, id), eq(examItems.exerciseId, exerciseId)));
  await audit(db, userId, 'exam.replace', id, traceId);
}

export async function removeExamItem(
  db: Database,
  userId: string,
  id: string,
  exerciseId: string,
  traceId?: string,
): Promise<void> {
  await loadForEdit(db, userId, id);
  await assertQuestionsOpen(db, id);
  await db
    .delete(examItems)
    .where(and(eq(examItems.examId, id), eq(examItems.exerciseId, exerciseId)));
  await audit(db, userId, 'exam.remove', id, traceId);
}

export async function deleteExam(
  db: Database,
  userId: string,
  id: string,
  traceId?: string,
): Promise<void> {
  await loadForEdit(db, userId, id);
  if (await isGiven(db, id)) {
    throw new ExerciseError(
      'conflict',
      'Cette épreuve est déjà donnée : elle reste, avec ses résultats.',
    );
  }
  await db.delete(exams).where(eq(exams.id, id));
  await audit(db, userId, 'exam.delete', id, traceId);
}

/** Donne l'épreuve à des classes : chacune reçoit un devoir fait des mêmes questions. */
export async function giveExam(
  db: Database,
  userId: string,
  id: string,
  input: GiveExamInput,
  traceId?: string,
): Promise<{ given: number; skipped: number }> {
  const { row } = await load(db, userId, id);
  const list = await items(db, id);
  if (list.length < 4) {
    throw new ExerciseError('invalid', 'Il faut au moins quatre questions pour donner l’épreuve.');
  }
  const already = new Set((await given(db, id)).map((g) => g.cohortId));
  let count = 0;
  let skipped = 0;
  for (const cohortId of [...new Set(input.cohortIds)]) {
    if (already.has(cohortId)) {
      skipped++;
      continue;
    }
    const { id: assignmentId } = await createAssignment(
      db,
      userId,
      cohortId,
      {
        title: row.title,
        instructions: input.onPaper
          ? `Épreuve sur papier de ${list.length} questions, environ ${row.durationMinutes} minutes. Ton enseignant saisit ta copie.`
          : `Épreuve de ${list.length} questions, environ ${row.durationMinutes} minutes. Réponds seul, sans aide : elle sert à voir ce qui est acquis.`,
        dueAt: input.dueAt,
        maxScore: 100,
      },
      traceId,
    ).catch((error: unknown) => {
      if (error instanceof TeamError) throw new ExerciseError(error.kind, error.message);
      throw error;
    });
    await db
      .insert(assignmentExercises)
      .values(list.map((i, position) => ({ assignmentId, exerciseId: i.exerciseId, position })));
    await db
      .update(assignments)
      .set({ examId: id, onPaper: input.onPaper })
      .where(eq(assignments.id, assignmentId));
    count++;
  }
  await audit(db, userId, 'exam.give', id, traceId);
  return { given: count, skipped };
}

const pct = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) : 0;

/** Résultats de l'épreuve dans les classes que la personne suit (toutes, ou une seule). */
export async function examResults(
  db: Database,
  userId: string,
  id: string,
  cohortId?: string,
): Promise<ExamResults> {
  const { row, p } = await load(db, userId, id);
  const all = await given(db, id);
  const mine: ExamGiven[] = [];
  for (const g of all) {
    if (p.superadmin || (await canManageCohort(db, userId, g.cohortId))) mine.push(g);
  }
  const selected = cohortId ? mine.filter((g) => g.cohortId === cohortId) : mine;
  const list = await items(db, id);
  const subs = selected.length
    ? await db
        .select({
          learnerId: assignmentSubmissions.learnerUserId,
          name: users.displayName,
          assignmentId: assignmentSubmissions.assignmentId,
          results: assignmentSubmissions.results,
        })
        .from(assignmentSubmissions)
        .innerJoin(users, eq(users.id, assignmentSubmissions.learnerUserId))
        .where(
          inArray(
            assignmentSubmissions.assignmentId,
            selected.map((g) => g.assignmentId),
          ),
        )
    : [];
  const scores = new Map<string, number[]>(list.map((i) => [i.exerciseId, []]));
  const learners: ExamResults['below'] = [];
  for (const s of subs) {
    const results = (s.results ?? []) as AssignmentExerciseResult[];
    for (const r of results) scores.get(r.exerciseId)?.push(r.score);
    const cohortName = selected.find((g) => g.assignmentId === s.assignmentId)?.cohortName ?? '';
    learners.push({
      learnerId: s.learnerId,
      name: s.name ?? 'Élève',
      cohortName,
      rate: pct(results.map((r) => r.score)),
    });
  }
  const group = (keyOf: (i: ExamItem) => string, labelOf: (k: string) => string, keys: string[]) =>
    keys
      .map((key) => {
        const its = list.filter((i) => keyOf(i) === key);
        return {
          key,
          label: labelOf(key),
          rate: pct(its.flatMap((i) => scores.get(i.exerciseId) ?? [])),
          count: its.length,
        } satisfies ExamRate;
      })
      .filter((r) => r.count > 0);
  const aboveThreshold = learners.filter((l) => l.rate >= row.threshold).length;
  return {
    exam: {
      id: row.id,
      title: row.title,
      threshold: row.threshold,
      questionCount: list.length,
    },
    cohorts: mine.map((g) => ({ id: g.cohortId, name: g.cohortName })),
    cohortId: cohortId && selected.length ? cohortId : null,
    expected: selected.reduce((a, g) => a + g.learnerCount, 0),
    participants: learners.length,
    aboveThreshold,
    average: learners.length
      ? Math.round(learners.reduce((a, l) => a + l.rate, 0) / learners.length)
      : null,
    byDomain: group(
      (i) => i.domain,
      (k) => EXERCISE_DOMAIN_LABELS[k as ExerciseDomain],
      [...EXERCISE_DOMAINS],
    ),
    bySkill: group(
      (i) => i.skill,
      (k) => EXERCISE_SKILL_LABELS[k as ExerciseSkill],
      [...EXERCISE_SKILLS],
    ),
    byQuestion: list.map((i) => ({
      key: i.exerciseId,
      label: i.title,
      position: i.position,
      domain: i.domain,
      rate: pct(scores.get(i.exerciseId) ?? []),
      count: scores.get(i.exerciseId)?.length ?? 0,
    })),
    below: learners.filter((l) => l.rate < row.threshold).sort((a, b) => a.rate - b.rate),
  };
}

const LETTERS = 'ABCDEFGHIJKLMNOP';
const letter = (i: number, choices: string[]) => `${LETTERS[i] ?? i + 1}. ${choices[i] ?? ''}`;

/** Réponse attendue en clair, pour le corrigé imprimé. */
export function answerKey(content: ExerciseContent): string {
  switch (content.kind) {
    case 'choice':
    case 'media':
    case 'table':
      return letter(content.correct, content.choices);
    case 'truefalse':
      return content.correct ? 'Vrai' : 'Faux';
    case 'gaps':
      return [...content.text.matchAll(GAP)].map((m) => m[1]!.split('|')[0]!.trim()).join(' ; ');
    case 'match':
      return content.pairs.map((p) => `${p.left} → ${p.right}`).join(' ; ');
    case 'order':
      return content.items.join(' → ');
    case 'number':
      return `${content.answer}${content.unit ? ` ${content.unit}` : ''}${
        content.tolerance ? ` (à ${content.tolerance} près)` : ''
      }`;
    case 'reading':
      return content.questions
        .map((q, i) => `${i + 1}) ${letter(q.correct, q.choices)}`)
        .join(' ; ');
  }
}

/** Livret imprimé : les questions telles que l'élève les voit, avec le corrigé à part. */
export async function examBooklet(db: Database, userId: string, id: string): Promise<ExamBooklet> {
  const { row } = await load(db, userId, id);
  return bookletOf(db, row);
}

/** Livret sans contrôle d'accès : l'appelant a vérifié le droit (épreuve ou campagne). */
export async function bookletOf(
  db: Database,
  row: typeof exams.$inferSelect,
): Promise<ExamBooklet> {
  const id = row.id;
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId));
  const rows = await db
    .select({
      exerciseId: exercises.id,
      title: exercises.title,
      domain: exercises.domain,
      content: exercises.content,
    })
    .from(examItems)
    .innerJoin(exercises, eq(exercises.id, examItems.exerciseId))
    .where(eq(examItems.examId, id))
    .orderBy(asc(examItems.position));
  return {
    exam: {
      id: row.id,
      title: row.title,
      durationMinutes: row.durationMinutes,
      organization: org?.name ?? '',
    },
    items: rows.map((r, i) => ({
      exerciseId: r.exerciseId,
      position: i + 1,
      title: r.title,
      domain: r.domain as ExerciseDomain,
      play: exercisePlay(r.content),
      answer: answerKey(r.content),
    })),
  };
}

async function paperAssignment(
  db: Database,
  userId: string,
  id: string,
  cohortId: string,
  campaignId?: string,
) {
  // Campagne de zone : l'équipe de l'école saisit sans voir l'épreuve dans sa banque.
  const row = campaignId
    ? (await db.select().from(exams).where(eq(exams.id, id)))[0]
    : (await load(db, userId, id)).row;
  if (!row) throw new ExerciseError('not_found', NOT_FOUND);
  const [a] = await db
    .select({ id: assignments.id, onPaper: assignments.onPaper, cohortName: cohorts.name })
    .from(assignments)
    .innerJoin(cohorts, eq(cohorts.id, assignments.cohortId))
    .where(
      and(
        eq(assignments.examId, id),
        eq(assignments.cohortId, cohortId),
        campaignId ? eq(assignments.campaignId, campaignId) : isNull(assignments.campaignId),
      ),
    );
  if (!a || !(await canManageCohort(db, userId, cohortId))) {
    throw new ExerciseError('not_found', 'Cette classe n’a pas reçu l’épreuve.');
  }
  return { row, assignment: a };
}

/** Grille de saisie : chaque élève de la classe, et sa copie si elle est déjà saisie. */
export async function examPaperSheet(
  db: Database,
  userId: string,
  id: string,
  cohortId: string,
  campaignId?: string,
): Promise<ExamPaperSheet> {
  const { row, assignment } = await paperAssignment(db, userId, id, cohortId, campaignId);
  const list = await items(db, id);
  const learners = await db
    .select({ id: users.id, name: users.displayName })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.role, 'apprenant')))
    .orderBy(asc(users.displayName));
  const subs = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.assignmentId, assignment.id));
  return {
    exam: { id: row.id, title: row.title },
    cohort: { id: cohortId, name: assignment.cohortName },
    assignmentId: assignment.id,
    onPaper: assignment.onPaper,
    items: list.map((i) => ({ exerciseId: i.exerciseId, position: i.position, title: i.title })),
    rows: learners.map((l) => {
      const sub = subs.find((s) => s.learnerUserId === l.id);
      const results = (sub?.results ?? []) as AssignmentExerciseResult[];
      return {
        learnerId: l.id,
        name: l.name ?? 'Élève',
        marks: sub
          ? list.map((i) =>
              (results.find((r) => r.exerciseId === i.exerciseId)?.score ?? 0) >= 1 ? 1 : 0,
            )
          : null,
        online: Boolean(sub?.attemptId),
      };
    }),
  };
}

/**
 * Enregistre les copies papier d'une classe : 1 = juste, 0 = faux pour chaque question. Une copie
 * faite en ligne ne se remplace pas ; une ligne sans copie efface la copie papier déjà saisie.
 */
export async function saveExamPaper(
  db: Database,
  userId: string,
  id: string,
  input: SaveExamPaperInput,
  traceId?: string,
  campaignId?: string,
): Promise<{ saved: number; removed: number }> {
  const { assignment } = await paperAssignment(db, userId, id, input.cohortId, campaignId);
  const list = await items(db, id);
  const members = new Set(
    (
      await db
        .select({ id: cohortMembers.userId })
        .from(cohortMembers)
        .where(and(eq(cohortMembers.cohortId, input.cohortId), eq(cohortMembers.role, 'apprenant')))
    ).map((m) => m.id),
  );
  const subs = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.assignmentId, assignment.id));
  let saved = 0;
  let removed = 0;
  for (const r of input.rows) {
    if (!members.has(r.learnerId)) continue;
    const existing = subs.find((s) => s.learnerUserId === r.learnerId);
    if (existing?.attemptId) continue;
    if (r.marks === null) {
      if (existing) {
        await db.delete(assignmentSubmissions).where(eq(assignmentSubmissions.id, existing.id));
        removed++;
      }
      continue;
    }
    if (r.marks.length !== list.length) {
      throw new ExerciseError(
        'invalid',
        'La grille ne correspond plus aux questions : rechargez la page.',
      );
    }
    const results: AssignmentExerciseResult[] = list.map((item, i) => ({
      exerciseId: item.exerciseId,
      title: item.title,
      correct: r.marks![i] === 1,
      score: r.marks![i]!,
      feedback: [],
    }));
    const good = results.filter((x) => x.correct).length;
    const values = {
      body: `Épreuve sur papier : ${good} réponse${good > 1 ? 's' : ''} juste${good > 1 ? 's' : ''} sur ${list.length}.`,
      results,
      score: Math.round((good / list.length) * 100),
      gradedByUserId: userId,
      gradedAt: sql`now()`,
    };
    if (existing) {
      await db
        .update(assignmentSubmissions)
        .set(values)
        .where(eq(assignmentSubmissions.id, existing.id));
    } else {
      await db
        .insert(assignmentSubmissions)
        .values({ assignmentId: assignment.id, learnerUserId: r.learnerId, ...values });
    }
    saved++;
  }
  await audit(db, userId, 'exam.paper', id, traceId);
  return { saved, removed };
}

export { items as examItemList };
