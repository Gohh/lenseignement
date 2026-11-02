import {
  oralItems,
  oralReferencePart,
  scoreOralPart,
  type CreateOralTestInput,
  type LevelCode,
  type OralBenchmark,
  type OralClass,
  type OralClassResults,
  type OralDone,
  type OralOverview,
  type OralPart,
  type OralPartScore,
  type OralSheet,
  type OralSubject,
  type OralTestDetail,
  type OralTestSummary,
  type SaveOralResultInput,
  type SaveOralTestInput,
} from '@lenseignement/types';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { inspectionOrganizationIds } from '../access/access.service.js';
import type { Database, Executor } from '../db/database.js';
import {
  auditLogs,
  oralBenchmarks,
  oralResults,
  oralTests,
  organizations,
  users,
} from '../db/schema.js';
import {
  ExerciseError,
  isExerciseAuthor,
  listExerciseOrganizations,
  powers,
  type Powers,
} from '../exercises/exercises.js';
import { oralModel } from './models.js';

/**
 * Évaluations orales chronométrées (étape 5a, maquette et choix validés par GOHH le 02/11/2026).
 * - Rédigées par les auteurs d'exercices pour leur structure ; publiées par la direction, le
 *   référent ou le conseiller pédagogique (ou le superadministrateur), puis figées.
 * - Passées par l'enseignant dans ses classes, la direction de l'école, et en visite par l'IEPP
 *   et le conseiller pédagogique dans les écoles qu'ils suivent.
 * - Aucune voix enregistrée : seules les cases touchées et les scores calculés sont gardés.
 * - Repères (score par minute attendu) réglés par le superadministrateur, niveau par niveau.
 */

const NOT_FOUND = 'Épreuve orale introuvable.';
const CLASS_NOT_FOUND = 'Classe introuvable.';
const UUID = /^[0-9a-f-]{36}$/i;

async function audit(db: Executor, userId: string, action: string, id: string, traceId?: string) {
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action,
    resourceType: 'oral_test',
    resourceId: id,
    decision: 'allow',
    reason: 'evaluations-orales',
    traceId,
  });
}

/** Classes que la personne enseigne ou dont elle tient l'école (sous-requête). */
function managedCohorts(userId: string): SQL {
  return sql`(
    select cm.cohort_id from cohort_members cm
     where cm.user_id = ${userId} and cm.role = 'enseignant'
    union
    select c.id from cohorts c where c.organization_id in (
      select m.organization_id from memberships m
       where m.user_id = ${userId}
         and m.role in ('chef-etablissement', 'censeur', 'correspondant-fichier')
         and (m.valid_until is null or m.valid_until > now())))`;
}

/** Classes où la personne fait passer une épreuve orale : les siennes, et en visite (sous-requête). */
function runnableCohorts(userId: string): SQL {
  return sql`(
    select x.cohort_id as id from ${managedCohorts(userId)} x
    union
    select c.id from cohorts c where c.organization_id in ${inspectionOrganizationIds(userId, true)})`;
}

async function canRun(db: Executor, userId: string, cohortId: string): Promise<boolean> {
  if (!UUID.test(cohortId)) return false;
  const { rows } = await db.execute(sql`
    select 1 from cohorts c where c.id = ${cohortId} and c.archived_at is null
       and c.id in ${runnableCohorts(userId)}`);
  return rows.length > 0;
}

/** Menu « Évaluations orales » : la personne fait passer, rédige ou règle les repères. */
export async function hasOral(db: Executor, userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`
    select 1 from cohorts c where c.archived_at is null and c.id in ${runnableCohorts(userId)} limit 1`);
  return rows.length > 0 || (await isExerciseAuthor(db, userId));
}

type TestRow = typeof oralTests.$inferSelect;

function canEdit(row: TestRow, userId: string, p: Powers): boolean {
  if (row.status !== 'brouillon') return false;
  return p.superadmin || p.authorOrgIds.has(row.organizationId) || row.authorId === userId;
}

function canPublish(row: TestRow, p: Powers): boolean {
  return row.status === 'brouillon' && (p.superadmin || p.publisherOrgIds.has(row.organizationId));
}

/** Brouillons : leur structure ; publiées : tous ceux qui font passer. */
function visible(userId: string, p: Powers): SQL | undefined {
  if (p.superadmin) return undefined;
  const ids = [...p.authorOrgIds, ...p.publisherOrgIds];
  return sql`(${oralTests.status} = 'publiee' or ${oralTests.authorId} = ${userId}
    ${ids.length ? sql`or ${oralTests.organizationId} in ${ids}` : sql``})`;
}

function summaryQuery(db: Executor) {
  return db
    .select({
      test: oralTests,
      organization: { id: organizations.id, name: organizations.name },
      author: users.displayName,
      resultCount: sql<number>`(select count(*)::int from oral_results r where r.test_id = ${oralTests.id})`,
    })
    .from(oralTests)
    .innerJoin(organizations, eq(organizations.id, oralTests.organizationId))
    .leftJoin(users, eq(users.id, oralTests.authorId));
}

type SummaryRow = Awaited<ReturnType<ReturnType<typeof summaryQuery>['where']>>[number];

function toSummary(r: SummaryRow, userId: string, p: Powers): OralTestSummary {
  return {
    id: r.test.id,
    title: r.test.title,
    subject: r.test.subject as OralSubject,
    level: r.test.level as LevelCode,
    status: r.test.status as OralTestSummary['status'],
    organization: r.organization,
    author: r.author,
    partCount: r.test.parts.length,
    resultCount: r.resultCount,
    canEdit: canEdit(r.test, userId, p),
    canPublish: canPublish(r.test, p),
  };
}

function toDetail(r: SummaryRow, userId: string, p: Powers): OralTestDetail {
  return { ...toSummary(r, userId, p), parts: r.test.parts };
}

async function load(db: Executor, userId: string, id: string) {
  if (!UUID.test(id)) throw new ExerciseError('not_found', NOT_FOUND);
  const p = await powers(db, userId);
  const where = visible(userId, p);
  const [row] = await summaryQuery(db).where(
    where ? and(eq(oralTests.id, id), where) : eq(oralTests.id, id),
  );
  if (!row) throw new ExerciseError('not_found', NOT_FOUND);
  return { row, p };
}

export async function getOralTest(db: Database, userId: string, id: string) {
  const { row, p } = await load(db, userId, id);
  return toDetail(row, userId, p);
}

async function myClasses(db: Executor, userId: string): Promise<OralClass[]> {
  const { rows } = await db.execute<{
    id: string;
    name: string;
    school: string;
    level: string | null;
    learners: number;
    managed: boolean;
  }>(sql`
    select c.id, c.name, o.name as school, c.level,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners,
      (c.id in ${managedCohorts(userId)}) as managed
      from cohorts c join organizations o on o.id = c.organization_id
     where c.archived_at is null and c.id in ${runnableCohorts(userId)}
     order by o.name, c.name
     limit 300`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    school: r.school,
    level: (r.level as LevelCode | null) ?? null,
    learners: r.learners,
    visit: !r.managed,
  }));
}

export async function oralOverview(db: Database, userId: string): Promise<OralOverview> {
  const p = await powers(db, userId);
  const [tests, classes, organizationsList] = await Promise.all([
    summaryQuery(db).where(visible(userId, p)).orderBy(desc(oralTests.updatedAt)).limit(200),
    myClasses(db, userId),
    listExerciseOrganizations(db, userId),
  ]);
  const { rows: done } = await db.execute<{
    test_id: string;
    test_title: string;
    cohort_id: string;
    cohort_name: string;
    school: string;
    evaluated: number;
    learners: number;
    last_at: Date;
  }>(sql`
    select r.test_id, t.title as test_title, c.id as cohort_id, c.name as cohort_name,
      o.name as school, count(*)::int as evaluated, max(r.taken_at) as last_at,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners
      from oral_results r
      join oral_tests t on t.id = r.test_id
      join cohorts c on c.id = r.cohort_id
      join organizations o on o.id = c.organization_id
     where c.id in ${runnableCohorts(userId)}
     group by r.test_id, t.title, c.id, c.name, o.name
     order by max(r.taken_at) desc
     limit 100`);
  return {
    tests: tests.map((r) => toSummary(r, userId, p)),
    classes,
    done: done.map((d): OralDone => ({
      testId: d.test_id,
      testTitle: d.test_title,
      cohortId: d.cohort_id,
      cohortName: d.cohort_name,
      school: d.school,
      evaluated: d.evaluated,
      learners: d.learners,
      lastAt: new Date(d.last_at).toISOString(),
    })),
    organizations: organizationsList,
    superadmin: p.superadmin,
  };
}

/** Une seule partie de référence ; le texte garde ses mots, la grille ses éléments. */
function cleanParts(parts: OralPart[]): OralPart[] {
  const reference = oralReferencePart(parts);
  return parts.map((part, i) => ({
    ...part,
    items: part.kind === 'grille' ? part.items : [],
    text: part.kind === 'texte' ? part.text : '',
    questions: part.kind === 'grille' ? [] : part.questions,
    reference: i === reference,
  }));
}

export async function createOralTest(
  db: Database,
  userId: string,
  input: CreateOralTestInput,
  traceId?: string,
): Promise<{ id: string }> {
  const p = await powers(db, userId);
  if (!p.superadmin && !p.authorOrgIds.has(input.organizationId)) {
    throw new ExerciseError('forbidden', 'Vous ne rédigez pas pour cette structure.');
  }
  const [row] = await db
    .insert(oralTests)
    .values({
      organizationId: input.organizationId,
      authorId: userId,
      title: input.title,
      subject: input.subject,
      level: input.level,
      parts: cleanParts(oralModel(input.model)),
    })
    .returning({ id: oralTests.id });
  await audit(db, userId, 'oral.create', row!.id, traceId);
  return { id: row!.id };
}

export async function updateOralTest(
  db: Database,
  userId: string,
  id: string,
  input: SaveOralTestInput,
  traceId?: string,
): Promise<void> {
  const { row, p } = await load(db, userId, id);
  if (row.test.status !== 'brouillon') {
    throw new ExerciseError(
      'conflict',
      'Une épreuve publiée ne se modifie plus : faites-en une copie.',
    );
  }
  if (!canEdit(row.test, userId, p)) {
    throw new ExerciseError(
      'forbidden',
      'Seuls les auteurs de cette structure modifient l’épreuve.',
    );
  }
  if (
    !p.superadmin &&
    !p.authorOrgIds.has(input.organizationId) &&
    input.organizationId !== row.test.organizationId
  ) {
    throw new ExerciseError('forbidden', 'Vous ne rédigez pas pour cette structure.');
  }
  await db
    .update(oralTests)
    .set({
      organizationId: input.organizationId,
      title: input.title,
      subject: input.subject,
      level: input.level,
      parts: cleanParts(input.parts),
      updatedAt: new Date(),
    })
    .where(eq(oralTests.id, id));
  await audit(db, userId, 'oral.update', id, traceId);
}

export async function publishOralTest(db: Database, userId: string, id: string, traceId?: string) {
  const { row, p } = await load(db, userId, id);
  if (row.test.status !== 'brouillon') throw new ExerciseError('conflict', 'Épreuve déjà publiée.');
  if (!canPublish(row.test, p)) {
    throw new ExerciseError(
      'forbidden',
      'La direction, le référent ou le conseiller pédagogique de la structure publie l’épreuve.',
    );
  }
  await db
    .update(oralTests)
    .set({ status: 'publiee', publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(oralTests.id, id));
  await audit(db, userId, 'oral.publish', id, traceId);
}

/** Copie modifiable d'une épreuve (pour en faire une nouvelle version). */
export async function copyOralTest(db: Database, userId: string, id: string, traceId?: string) {
  const { row, p } = await load(db, userId, id);
  const organizationId =
    p.superadmin || p.authorOrgIds.has(row.test.organizationId)
      ? row.test.organizationId
      : [...p.authorOrgIds][0];
  if (!organizationId)
    throw new ExerciseError('forbidden', 'Vous ne rédigez pour aucune structure.');
  const [copy] = await db
    .insert(oralTests)
    .values({
      organizationId,
      authorId: userId,
      title: `${row.test.title} (copie)`.slice(0, 120),
      subject: row.test.subject,
      level: row.test.level,
      parts: row.test.parts,
    })
    .returning({ id: oralTests.id });
  await audit(db, userId, 'oral.copy', copy!.id, traceId);
  return { id: copy!.id };
}

export async function deleteOralTest(db: Database, userId: string, id: string, traceId?: string) {
  const { row, p } = await load(db, userId, id);
  if (!canEdit(row.test, userId, p)) {
    throw new ExerciseError('forbidden', 'Seul un brouillon de votre structure se supprime.');
  }
  if (row.resultCount > 0) {
    throw new ExerciseError('conflict', 'Des élèves ont déjà passé cette épreuve : elle reste.');
  }
  await db.delete(oralTests).where(eq(oralTests.id, id));
  await audit(db, userId, 'oral.delete', id, traceId);
}

async function cohortInfo(db: Executor, cohortId: string) {
  const { rows } = await db.execute<{
    id: string;
    name: string;
    school: string;
    learners: number;
  }>(sql`
    select c.id, c.name, o.name as school,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners
      from cohorts c join organizations o on o.id = c.organization_id where c.id = ${cohortId}`);
  return rows[0]!;
}

async function cohortLearners(db: Executor, cohortId: string) {
  const { rows } = await db.execute<{ id: string; name: string | null }>(sql`
    select u.id, u.display_name as name from cohort_members cm join users u on u.id = cm.user_id
     where cm.cohort_id = ${cohortId} and cm.role = 'apprenant'
     order by u.display_name nulls last, u.id`);
  return rows.map((r) => ({ id: r.id, name: r.name ?? 'Élève sans nom' }));
}

async function loadPublishedFor(db: Executor, userId: string, testId: string, cohortId: string) {
  const loaded = await load(db, userId, testId);
  if (loaded.row.test.status !== 'publiee') {
    throw new ExerciseError('conflict', 'Cette épreuve n’est pas encore publiée.');
  }
  if (!(await canRun(db, userId, cohortId))) throw new ExerciseError('not_found', CLASS_NOT_FOUND);
  return loaded;
}

/** Feuille de passation : l'épreuve publiée et les élèves de la classe. */
export async function oralSheet(
  db: Database,
  userId: string,
  testId: string,
  cohortId: string,
): Promise<OralSheet> {
  const { row, p } = await loadPublishedFor(db, userId, testId, cohortId);
  const [cohort, learners, done] = await Promise.all([
    cohortInfo(db, cohortId),
    cohortLearners(db, cohortId),
    db
      .select({ learnerId: oralResults.learnerId })
      .from(oralResults)
      .where(and(eq(oralResults.testId, testId), eq(oralResults.cohortId, cohortId))),
  ]);
  const doneIds = new Set(done.map((d) => d.learnerId));
  return {
    test: toDetail(row, userId, p),
    cohort: { id: cohort.id, name: cohort.name, school: cohort.school },
    learners: learners.map((l) => ({ ...l, done: doneIds.has(l.id) })),
  };
}

/** Enregistre ce que l'enseignant a noté ; la plateforme calcule les scores. */
export async function saveOralResult(
  db: Database,
  userId: string,
  input: SaveOralResultInput,
  traceId?: string,
): Promise<{ id: string; scores: OralPartScore[] }> {
  const [already] = await db
    .select({ id: oralResults.id, scores: oralResults.scores })
    .from(oralResults)
    .where(eq(oralResults.operationId, input.operationId));
  if (already) return already;
  const { row } = await loadPublishedFor(db, userId, input.testId, input.cohortId);
  const { rows: member } = await db.execute(sql`
    select 1 from cohort_members where cohort_id = ${input.cohortId}
       and user_id = ${input.learnerId} and role = 'apprenant'`);
  if (member.length === 0)
    throw new ExerciseError('invalid', 'Cet élève n’est pas dans la classe.');
  const parts = row.test.parts;
  if (input.parts.length !== parts.length) {
    throw new ExerciseError('invalid', 'Il manque des parties : recommencez la passation.');
  }
  const scores = parts.map((part, i) => scoreOralPart(part, input.parts[i]!));
  const takenAt = input.takenAt ? new Date(input.takenAt) : new Date();
  const values = {
    testId: input.testId,
    cohortId: input.cohortId,
    learnerId: input.learnerId,
    assessorId: userId,
    operationId: input.operationId,
    takenAt: takenAt > new Date() ? new Date() : takenAt,
    parts: input.parts,
    scores,
  };
  const [saved] = await db
    .insert(oralResults)
    .values(values)
    .onConflictDoUpdate({
      target: [oralResults.testId, oralResults.learnerId],
      set: { ...values, createdAt: new Date() },
    })
    .returning({ id: oralResults.id });
  await audit(db, userId, 'oral.result', input.testId, traceId);
  return { id: saved!.id, scores };
}

export async function listOralBenchmarks(db: Executor): Promise<OralBenchmark[]> {
  const rows = await db.select().from(oralBenchmarks);
  return rows.map((r) => ({
    level: r.level as LevelCode,
    subject: r.subject as OralSubject,
    perMinute: r.perMinute,
    questions: r.questions,
  }));
}

export async function saveOralBenchmarks(
  db: Database,
  userId: string,
  items: Array<{
    level: LevelCode;
    subject: OralSubject;
    perMinute: number | null;
    questions: number | null;
  }>,
  traceId?: string,
): Promise<OralBenchmark[]> {
  const p = await powers(db, userId);
  if (!p.superadmin) {
    throw new ExerciseError('forbidden', 'Seul le superadministrateur règle les repères.');
  }
  await db.transaction(async (tx) => {
    await tx.delete(oralBenchmarks);
    const kept = items.filter((i) => i.perMinute !== null);
    if (kept.length) {
      await tx.insert(oralBenchmarks).values(
        kept.map((i) => ({
          level: i.level,
          subject: i.subject,
          perMinute: i.perMinute!,
          questions: i.questions,
          updatedBy: userId,
        })),
      );
    }
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: 'oral.benchmarks',
      resourceType: 'oral_benchmarks',
      resourceId: 'reperes',
      decision: 'allow',
      reason: 'evaluations-orales',
      traceId,
    });
  });
  return listOralBenchmarks(db);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

const percent = (n: number, total: number) => (total ? Math.round((n * 100) / total) : null);

/** Résultats d'une classe : médiane, élèves à zéro, repère atteint, détail par élève. */
export async function oralClassResults(
  db: Database,
  userId: string,
  testId: string,
  cohortId: string,
): Promise<OralClassResults> {
  const { row, p } = await load(db, userId, testId);
  if (!(await canRun(db, userId, cohortId))) throw new ExerciseError('not_found', CLASS_NOT_FOUND);
  const test = toDetail(row, userId, p);
  const [cohort, learners, results, benchmarks] = await Promise.all([
    cohortInfo(db, cohortId),
    cohortLearners(db, cohortId),
    db
      .select({
        learnerId: oralResults.learnerId,
        takenAt: oralResults.takenAt,
        scores: oralResults.scores,
        assessor: users.displayName,
        learnerName: sql<
          string | null
        >`(select display_name from users l where l.id = ${oralResults.learnerId})`,
      })
      .from(oralResults)
      .leftJoin(users, eq(users.id, oralResults.assessorId))
      .where(and(eq(oralResults.testId, testId), eq(oralResults.cohortId, cohortId))),
    listOralBenchmarks(db),
  ]);
  const benchmark =
    benchmarks.find((b) => b.level === test.level && b.subject === test.subject) ?? null;
  const reference = oralReferencePart(test.parts);
  const refPart = test.parts[reference]!;
  const timed = refPart.kind !== 'questions';
  const value = (s: OralPartScore) => (timed ? (s.perMinute ?? 0) : s.correct);
  const reached = (scores: OralPartScore[]): boolean | null => {
    if (!benchmark) return null;
    const s = scores[reference];
    if (!s) return false;
    if (value(s) < benchmark.perMinute) return false;
    return benchmark.questions === null || s.questionsCorrect === null
      ? true
      : s.questionsCorrect >= benchmark.questions;
  };
  const byLearner = new Map(results.map((r) => [r.learnerId, r]));
  // Élèves partis de la classe : leur résultat reste compté.
  const everyone = [
    ...learners,
    ...results
      .filter((r) => !learners.some((l) => l.id === r.learnerId))
      .map((r) => ({ id: r.learnerId, name: r.learnerName ?? 'Élève sans nom' })),
  ];
  const refValues = results.map((r) => (r.scores[reference] ? value(r.scores[reference]) : 0));
  const zero = refValues.filter((v) => v === 0).length;
  const reachedCount = results.filter((r) => reached(r.scores)).length;
  const bands: OralClassResults['bands'] = benchmark
    ? [
        { key: 'zero', label: 'Aucun juste', count: zero },
        {
          key: 'debut',
          label: 'Débute (moins de la moitié du repère)',
          count: refValues.filter((v) => v > 0 && v < benchmark.perMinute / 2).length,
        },
        {
          key: 'progres',
          label: 'En progrès',
          count: results.filter((r, i) => {
            const v = refValues[i]!;
            return v >= benchmark.perMinute / 2 && !reached(r.scores);
          }).length,
        },
        { key: 'repere', label: 'Repère atteint', count: reachedCount },
      ]
    : [
        { key: 'zero', label: 'Aucun juste', count: zero },
        { key: 'progres', label: 'Au moins un juste', count: results.length - zero },
      ];
  const byPart = test.parts.map((part, i) => {
    const isTimed = part.kind !== 'questions';
    const values = results.map((r) =>
      r.scores[i] ? (isTimed ? (r.scores[i].perMinute ?? 0) : r.scores[i].correct) : 0,
    );
    const average = values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : 0;
    return {
      title: part.title,
      kind: part.kind,
      average,
      unit: isTimed ? 'par minute' : `sur ${part.questions.length}`,
      max: isTimed
        ? Math.max(1, Math.round((oralItems(part).length * 60) / part.seconds))
        : part.questions.length,
    };
  });
  return {
    test,
    cohort,
    benchmark,
    referencePart: reference,
    evaluated: results.length,
    median: median(refValues),
    zeroRate: percent(zero, results.length),
    benchmarkRate: benchmark ? percent(reachedCount, results.length) : null,
    byPart,
    bands,
    learners: everyone.map((l) => {
      const r = byLearner.get(l.id);
      return {
        id: l.id,
        name: l.name,
        takenAt: r ? r.takenAt.toISOString() : null,
        assessor: r?.assessor ?? null,
        scores: r?.scores ?? null,
        reached: r ? reached(r.scores) : null,
      };
    }),
  };
}
