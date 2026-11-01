import {
  UpdateWorkshopSchema,
  WORKSHOP_TRADES,
  type CreateWorkshopInput,
  type UpdateWorkshopInput,
  type WorkshopCard,
  type WorkshopCompetencyOption,
  type WorkshopDetail,
  type WorkshopStepInput,
  type WorkshopSummary,
  type WorkshopTrade,
} from '@lenseignement/types';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  AUTHOR_ROLES,
  PUBLISHER_ROLES,
  organizationIdsWithRoles,
} from '../access/access.service.js';
import type { Database, Executor } from '../db/database.js';
import {
  auditLogs,
  competencies,
  curricula,
  curriculumVersions,
  organizations,
  safetySimulations,
  users,
  workshops,
  type SimulationStepDef,
} from '../db/schema.js';

/**
 * Ateliers rédigés sur la plateforme (proposition « Atelier ouvert à tous les métiers », validée
 * par GOHH le 01/11/2026). Circuit : brouillon → relecture → publié (version figée) → retiré.
 * L'auteur ne publie pas son propre atelier, sauf le superadministrateur.
 */

export class WorkshopError extends Error {
  constructor(
    readonly kind: 'invalid' | 'forbidden' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

const NOT_FOUND = 'Atelier introuvable.';

/** Le superadministrateur et l'administrateur rédigent et publient partout. */
function platformAdmin(userId: string): SQL {
  return sql`exists (
    select 1 from memberships m
     where m.user_id = ${userId} and m.role in ('superadministrateur', 'administrateur')
       and (m.valid_until is null or m.valid_until > now()))`;
}

/** Structures où la personne a l'un des rôles donnés ; toutes pour l'administration. */
function workshopOrganizationIds(userId: string, roles: readonly string[]): SQL {
  return sql`(
    select a.id from ${organizationIdsWithRoles(userId, roles)} a
    union
    select o.id from organizations o where ${platformAdmin(userId)})`;
}

const authorOrgs = (userId: string) => workshopOrganizationIds(userId, AUTHOR_ROLES);
const publisherOrgs = (userId: string) => workshopOrganizationIds(userId, PUBLISHER_ROLES);

async function isSuperadmin(db: Executor, userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`
    select 1 from memberships
     where user_id = ${userId} and role = 'superadministrateur'
       and (valid_until is null or valid_until > now())`);
  return rows.length > 0;
}

async function inOrgs(db: Executor, orgs: SQL, organizationId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`select 1 from ${orgs} x where x.id = ${organizationId}`);
  return rows.length > 0;
}

async function audit(db: Executor, userId: string, action: string, id: string, traceId?: string) {
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action,
    resourceType: 'workshop',
    resourceId: id,
    decision: 'allow',
    reason: 'ateliers',
    traceId,
  });
}

/** La personne peut rédiger ou publier des ateliers quelque part. */
export async function isWorkshopAuthor(db: Executor, userId: string): Promise<boolean> {
  const { rows } = await db.execute(
    sql`select 1 from ${workshopOrganizationIds(userId, [...AUTHOR_ROLES, ...PUBLISHER_ROLES])} x limit 1`,
  );
  return rows.length > 0;
}

/** Structures où la personne peut créer un atelier. */
export async function listWorkshopOrganizations(db: Database, userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      and(inArray(organizations.id, authorOrgs(userId)), sql`${organizations.archivedAt} is null`),
    )
    .orderBy(asc(organizations.name));
}

/** Compétences des programmes publiés, pour rattacher un atelier. */
export async function listWorkshopCompetencies(db: Database): Promise<WorkshopCompetencyOption[]> {
  const rows = await db
    .select({
      id: competencies.id,
      code: competencies.code,
      title: competencies.title,
      curriculumTitle: curricula.title,
      label: curriculumVersions.label,
    })
    .from(competencies)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
    .where(eq(curriculumVersions.status, 'published'))
    .orderBy(asc(curricula.title), asc(curriculumVersions.label), asc(competencies.position))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    curriculum: `${r.curriculumTitle} (${r.label})`,
  }));
}

const summaryColumns = {
  id: workshops.id,
  title: workshops.title,
  trade: workshops.trade,
  status: workshops.status,
  summary: workshops.summary,
  competencyId: workshops.competencyId,
  practice: workshops.practice,
  steps: workshops.steps,
  reviewNote: workshops.reviewNote,
  updatedAt: workshops.updatedAt,
  authorId: workshops.authorId,
  author: users.displayName,
  organization: { id: organizations.id, name: organizations.name },
  liveCode: sql<string | null>`(
    select s.code from safety_simulations s where s.workshop_id = ${workshops.id}
     order by s.created_at desc limit 1)`,
};

type Row = {
  id: string;
  title: string;
  trade: string;
  status: 'draft' | 'review' | 'published' | 'archived';
  summary: string;
  competencyId: string | null;
  practice: boolean;
  steps: WorkshopStepInput[];
  reviewNote: string | null;
  updatedAt: Date;
  authorId: string | null;
  author: string | null;
  organization: { id: string; name: string };
  liveCode: string | null;
};

interface Powers {
  publisherOrgIds: Set<string>;
  authorOrgIds: Set<string>;
  superadmin: boolean;
}

async function powers(db: Executor, userId: string): Promise<Powers> {
  const [authors, publishers, superadmin] = await Promise.all([
    db.execute(sql`select id from ${authorOrgs(userId)} a`),
    db.execute(sql`select id from ${publisherOrgs(userId)} p`),
    isSuperadmin(db, userId),
  ]);
  const ids = (rows: unknown[]) => new Set(rows.map((r) => (r as { id: string }).id));
  return {
    authorOrgIds: ids(authors.rows),
    publisherOrgIds: ids(publishers.rows),
    superadmin,
  };
}

function toSummary(row: Row, userId: string, p: Powers): WorkshopSummary {
  return {
    id: row.id,
    title: row.title,
    trade: row.trade as WorkshopTrade,
    status: row.status,
    organization: row.organization,
    author: row.author,
    stepCount: row.steps.length,
    live: row.liveCode !== null,
    reviewNote: row.reviewNote,
    updatedAt: row.updatedAt.toISOString(),
    canPublish:
      p.publisherOrgIds.has(row.organization.id) && (row.authorId !== userId || p.superadmin),
  };
}

/** Ateliers des structures de la personne (comme auteur ou pour les publier). */
export async function listWorkshops(db: Database, userId: string): Promise<WorkshopSummary[]> {
  const p = await powers(db, userId);
  const orgIds = [...new Set([...p.authorOrgIds, ...p.publisherOrgIds])];
  if (orgIds.length === 0) return [];
  const rows = (await db
    .select(summaryColumns)
    .from(workshops)
    .innerJoin(organizations, eq(organizations.id, workshops.organizationId))
    .leftJoin(users, eq(users.id, workshops.authorId))
    .where(inArray(workshops.organizationId, orgIds))
    .orderBy(
      sql`case ${workshops.status} when 'review' then 0 when 'draft' then 1 else 2 end`,
      desc(workshops.updatedAt),
    )) as Row[];
  return rows.map((row) => toSummary(row, userId, p));
}

async function load(db: Executor, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new WorkshopError('not_found', NOT_FOUND);
  const [row] = (await db
    .select(summaryColumns)
    .from(workshops)
    .innerJoin(organizations, eq(organizations.id, workshops.organizationId))
    .leftJoin(users, eq(users.id, workshops.authorId))
    .where(eq(workshops.id, id))) as Row[];
  if (!row) throw new WorkshopError('not_found', NOT_FOUND);
  return row;
}

/** Charge l'atelier si la personne y a accès (auteur ou publieur de sa structure). */
async function loadFor(db: Executor, userId: string, id: string) {
  const row = await load(db, id);
  const p = await powers(db, userId);
  const org = row.organization.id;
  if (!p.authorOrgIds.has(org) && !p.publisherOrgIds.has(org)) {
    throw new WorkshopError('not_found', NOT_FOUND);
  }
  return { row, p };
}

export async function getWorkshop(
  db: Database,
  userId: string,
  id: string,
): Promise<WorkshopDetail> {
  const { row, p } = await loadFor(db, userId, id);
  let competency: WorkshopDetail['competency'] = null;
  if (row.competencyId) {
    const [c] = await db
      .select({
        id: competencies.id,
        code: competencies.code,
        title: competencies.title,
        curriculumTitle: curricula.title,
        label: curriculumVersions.label,
      })
      .from(competencies)
      .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
      .innerJoin(curricula, eq(curricula.id, curriculumVersions.curriculumId))
      .where(eq(competencies.id, row.competencyId));
    if (c) {
      competency = {
        id: c.id,
        code: c.code,
        title: c.title,
        curriculum: `${c.curriculumTitle} (${c.label})`,
      };
    }
  }
  return {
    ...toSummary(row, userId, p),
    summary: row.summary,
    competency,
    practice: row.practice,
    steps: row.steps,
    liveCode: row.liveCode,
    canEdit: p.authorOrgIds.has(row.organization.id),
  };
}

export async function createWorkshop(
  db: Database,
  userId: string,
  input: CreateWorkshopInput,
  traceId?: string,
): Promise<{ id: string }> {
  if (!(await inOrgs(db, authorOrgs(userId), input.organizationId))) {
    throw new WorkshopError(
      'forbidden',
      'Vous ne pouvez pas créer d’atelier pour cette structure.',
    );
  }
  const [row] = await db
    .insert(workshops)
    .values({
      organizationId: input.organizationId,
      trade: input.trade,
      title: input.title,
      authorId: userId,
    })
    .returning({ id: workshops.id });
  await audit(db, userId, 'workshop.create', row!.id, traceId);
  return { id: row!.id };
}

async function loadForAuthor(db: Executor, userId: string, id: string) {
  const { row, p } = await loadFor(db, userId, id);
  if (!p.authorOrgIds.has(row.organization.id)) {
    throw new WorkshopError(
      'forbidden',
      'Seuls les auteurs de la structure modifient cet atelier.',
    );
  }
  return row;
}

async function loadForPublisher(db: Executor, userId: string, id: string) {
  const { row, p } = await loadFor(db, userId, id);
  if (!p.publisherOrgIds.has(row.organization.id)) {
    throw new WorkshopError(
      'forbidden',
      'Seuls la direction et le référent pédagogique publient les ateliers.',
    );
  }
  if (row.authorId === userId && !p.superadmin) {
    throw new WorkshopError(
      'forbidden',
      'Vous ne pouvez pas relire votre propre atelier : une autre personne doit le faire.',
    );
  }
  return row;
}

async function assertCompetency(db: Executor, competencyId: string | null) {
  if (!competencyId) return;
  const [c] = await db
    .select({ id: competencies.id })
    .from(competencies)
    .innerJoin(curriculumVersions, eq(curriculumVersions.id, competencies.versionId))
    .where(and(eq(competencies.id, competencyId), eq(curriculumVersions.status, 'published')));
  if (!c) throw new WorkshopError('invalid', 'Choisissez une compétence d’un programme publié.');
}

/** Enregistre le brouillon (fiche et étapes). */
export async function updateWorkshop(
  db: Database,
  userId: string,
  id: string,
  input: UpdateWorkshopInput,
): Promise<WorkshopDetail> {
  const row = await loadForAuthor(db, userId, id);
  if (row.status !== 'draft') {
    throw new WorkshopError(
      'conflict',
      row.status === 'review'
        ? 'Cet atelier est en relecture : attendez la réponse avant de le modifier.'
        : 'Cliquez d’abord sur « Modifier » pour ouvrir un brouillon.',
    );
  }
  await assertCompetency(db, input.competencyId);
  await db
    .update(workshops)
    .set({
      trade: input.trade,
      title: input.title,
      summary: input.summary,
      competencyId: input.competencyId,
      practice: input.practice,
      steps: input.steps,
      updatedAt: new Date(),
    })
    .where(eq(workshops.id, id));
  return getWorkshop(db, userId, id);
}

/** Rouvre un brouillon sur un atelier publié ou retiré : la version en ligne reste en place. */
export async function reopenWorkshop(db: Database, userId: string, id: string) {
  const row = await loadForAuthor(db, userId, id);
  if (row.status === 'draft') return;
  if (row.status === 'review') {
    throw new WorkshopError('conflict', 'Cet atelier est en relecture.');
  }
  await db
    .update(workshops)
    .set({ status: 'draft', updatedAt: new Date() })
    .where(eq(workshops.id, id));
}

/** Supprime un brouillon jamais publié. */
export async function deleteWorkshop(db: Database, userId: string, id: string, traceId?: string) {
  const row = await loadForAuthor(db, userId, id);
  if (row.liveCode || row.status !== 'draft') {
    throw new WorkshopError(
      'conflict',
      'Un atelier déjà publié ne se supprime pas : retirez-le du catalogue.',
    );
  }
  await db.delete(workshops).where(eq(workshops.id, id));
  await audit(db, userId, 'workshop.delete', id, traceId);
}

export async function submitWorkshop(db: Database, userId: string, id: string, traceId?: string) {
  const row = await loadForAuthor(db, userId, id);
  if (row.status !== 'draft')
    throw new WorkshopError('conflict', 'Cet atelier n’est pas un brouillon.');
  const parsed = UpdateWorkshopSchema.safeParse({
    trade: row.trade,
    title: row.title,
    summary: row.summary,
    competencyId: row.competencyId,
    practice: row.practice,
    steps: row.steps,
  });
  if (!parsed.success || row.steps.length === 0) {
    throw new WorkshopError('invalid', 'Ajoutez au moins une étape complète avant l’envoi.');
  }
  await db
    .update(workshops)
    .set({ status: 'review', reviewNote: null, updatedAt: new Date() })
    .where(eq(workshops.id, id));
  await audit(db, userId, 'workshop.submit', id, traceId);
}

export async function returnWorkshop(
  db: Database,
  userId: string,
  id: string,
  note: string,
  traceId?: string,
) {
  const row = await loadForPublisher(db, userId, id);
  if (row.status !== 'review')
    throw new WorkshopError('conflict', 'Cet atelier n’est pas en relecture.');
  await db
    .update(workshops)
    .set({ status: 'draft', reviewNote: note, reviewedBy: userId, updatedAt: new Date() })
    .where(eq(workshops.id, id));
  await audit(db, userId, 'workshop.return', id, traceId);
}

/**
 * Mélange fixe des gestes pour l'affichage (jamais l'ordre juste) : on les fait tourner d'un
 * cran, puis on alterne début et fin.
 */
export function displayOrder(n: number): number[] {
  const rotated = Array.from({ length: n }, (_, i) => (i + 1) % n);
  const out: number[] = [];
  for (let lo = 0, hi = n - 1; lo <= hi; lo++, hi--) {
    out.push(rotated[lo]!);
    if (lo !== hi) out.push(rotated[hi]!);
  }
  return out;
}

/** Étapes de l'auteur → étapes figées de la simulation, avec leur corrigé. */
export function toSimulationSteps(steps: WorkshopStepInput[]): SimulationStepDef[] {
  return steps.map((step, i): SimulationStepDef => {
    const base = { id: `etape-${i + 1}`, title: step.title, instructions: step.instructions };
    if (step.kind === 'identify') {
      return { kind: 'identify', ...base, questions: step.questions };
    }
    if (step.kind === 'equipment') {
      return {
        kind: 'equipment',
        ...base,
        options: step.options.map((o) => o.label),
        required: step.options.flatMap((o, k) => (o.needed ? [k] : [])),
        explanations: step.options.map(
          (o) => o.explanation || (o.needed ? 'Il faut le prendre.' : 'Pas utile ici.'),
        ),
      };
    }
    const shown = displayOrder(step.gestures.length);
    return {
      kind: 'order',
      ...base,
      gestures: shown.map((g) => step.gestures[g]!.label),
      correctOrder: step.gestures.map((_, g) => shown.indexOf(g)),
      explanations: shown.map((g) => step.gestures[g]!.explanation),
    };
  });
}

/** Publie : crée une version figée, que les élèves font désormais. */
export async function publishWorkshop(db: Database, userId: string, id: string, traceId?: string) {
  const row = await loadForPublisher(db, userId, id);
  if (row.status !== 'review')
    throw new WorkshopError('conflict', 'Cet atelier n’est pas en relecture.');
  let curriculumVersionId: string | null = null;
  if (row.competencyId) {
    const [c] = await db
      .select({ versionId: competencies.versionId })
      .from(competencies)
      .where(eq(competencies.id, row.competencyId));
    curriculumVersionId = c?.versionId ?? null;
  }
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(
      sql`select count(*)::int as n from safety_simulations where workshop_id = ${id}`,
    );
    const n = (rows[0] as { n: number }).n + 1;
    await tx.insert(safetySimulations).values({
      code: `ATELIER-${id.slice(0, 8).toUpperCase()}-V${n}`,
      title: row.title,
      curriculumVersionId,
      competencyId: row.competencyId,
      practiceCompetencyId: row.competencyId,
      steps: toSimulationSteps(row.steps),
      workshopId: id,
      trade: row.trade,
      summary: row.summary,
      practice: row.practice,
    });
    await tx
      .update(workshops)
      .set({ status: 'published', reviewNote: null, reviewedBy: userId, updatedAt: new Date() })
      .where(eq(workshops.id, id));
  });
  await audit(db, userId, 'workshop.publish', id, traceId);
}

/** Retire du catalogue, ou remet en ligne la dernière version publiée. */
export async function setWorkshopArchived(
  db: Database,
  userId: string,
  id: string,
  archived: boolean,
  traceId?: string,
) {
  const { row, p } = await loadFor(db, userId, id);
  if (!p.publisherOrgIds.has(row.organization.id)) {
    throw new WorkshopError(
      'forbidden',
      'Seuls la direction et le référent pédagogique retirent les ateliers.',
    );
  }
  if (archived ? row.status === 'archived' || !row.liveCode : row.status !== 'archived') {
    throw new WorkshopError('conflict', 'Rien à changer.');
  }
  await db
    .update(workshops)
    .set({ status: archived ? 'archived' : 'published', updatedAt: new Date() })
    .where(eq(workshops.id, id));
  await audit(db, userId, archived ? 'workshop.archive' : 'workshop.restore', id, traceId);
}

/**
 * L'Atelier s'affiche pour les élèves concernés : inscrits dans un établissement d'enseignement
 * technique, en alphabétisation, ou qui suivent un cours de l'espace « Métiers et ateliers ».
 * Celui qui a déjà commencé un atelier le garde.
 */
export async function isWorkshopLearner(db: Executor, userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`
    select 1 where
      exists (select 1 from users u where u.id = ${userId} and u.level like 'alpha-%')
      or exists (
        select 1 from memberships m join organizations o on o.id = m.organization_id
         where m.user_id = ${userId} and m.role = 'apprenant'
           and o.type in ('technical_center', 'literacy_center')
           and (m.valid_until is null or m.valid_until > now()))
      or exists (
        select 1 from cohort_members cm
          join cohorts c on c.id = cm.cohort_id
          join organizations o on o.id = c.organization_id
         where cm.user_id = ${userId} and cm.role = 'apprenant' and c.archived_at is null
           and o.type in ('technical_center', 'literacy_center'))
      or exists (
        select 1 from enrollments e join courses k on k.id = e.course_id
         where e.user_id = ${userId} and k.branch = 'technique')
      or exists (select 1 from simulation_attempts a where a.user_id = ${userId})`);
  return rows.length > 0;
}

/**
 * Catalogue de l'élève : la dernière version publiée de chaque atelier en ligne, et l'atelier
 * d'origine ; l'avancement compte les essais faits sur toutes les versions d'un même atelier.
 */
export async function workshopCatalog(db: Database, userId: string): Promise<WorkshopCard[]> {
  const { rows } = await db.execute<{
    code: string;
    title: string;
    trade: string | null;
    summary: string | null;
    steps: unknown[];
    practice: boolean;
    passed: boolean | null;
    requested: boolean;
  }>(sql`
    with live as (
      select distinct on (coalesce(s.workshop_id, s.id)) s.*, coalesce(s.workshop_id, s.id) as family
        from safety_simulations s
        left join workshops w on w.id = s.workshop_id
       where s.workshop_id is null or w.status <> 'archived'
       order by coalesce(s.workshop_id, s.id), s.created_at desc
    ),
    family_sims as (
      select l.family, s.id from live l
        join safety_simulations s on coalesce(s.workshop_id, s.id) = l.family
    )
    select l.code, l.title, l.trade, l.summary, l.steps, l.practice,
           (select a.passed from simulation_attempts a
              where a.user_id = ${userId} and a.simulation_id in (select f.id from family_sims f where f.family = l.family)
              order by a.submitted_at desc, a.id desc limit 1) as passed,
           exists (select 1 from practice_requests r
              where r.user_id = ${userId} and r.simulation_id in (select f.id from family_sims f where f.family = l.family)) as requested
      from live l
     order by l.trade nulls first, l.title`);
  const trades = new Set<string>(WORKSHOP_TRADES);
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    trade: (r.trade && trades.has(r.trade) ? r.trade : 'electricite') as WorkshopTrade,
    summary: r.summary ?? '',
    stepCount: r.steps.length,
    practice: r.practice,
    progress: r.requested ? 'practice' : r.passed === null ? 'todo' : r.passed ? 'passed' : 'retry',
  }));
}
