import type {
  CampaignClass,
  CampaignDetail,
  CampaignOptions,
  CampaignPreview,
  CampaignSchoolRow,
  CampaignStatus,
  CampaignSummary,
  CampaignZone,
  CreateCampaignInput,
  LevelCode,
  SaveExamPaperInput,
} from '@lenseignement/types';
import { levelLabel } from '@lenseignement/types';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { Database, Executor } from '../db/database.js';
import {
  assignmentExercises,
  assignments,
  assignmentSubmissions,
  auditLogs,
  examCampaigns,
  exams,
} from '../db/schema.js';
import { ExerciseError } from '../exercises/exercises.js';
import { canManageCohort } from '../sessions/class-sessions.js';
import { bookletOf, examItemList, examPaperSheet, listExams, saveExamPaper } from './exams.js';

/**
 * Campagnes d'épreuves de zone (étape 4c-1, maquette validée par GOHH le 02/11/2026).
 * - Qui lance : superadministrateur, administrateur et directions centrales (tout le pays ou une
 *   zone), gestionnaire (sa DRENA et ses IEPP), IEPP (ses écoles).
 * - Toutes les classes du niveau dans les écoles de la zone reçoivent l'épreuve ; chaque école
 *   choisit seulement « en ligne » ou « papier », classe par classe.
 * - Les élèves la voient à la date de début ; les notes restent cachées (élèves, enseignants)
 *   jusqu'à la clôture. Pendant la campagne, on ne suit que la participation.
 */

const NOT_FOUND = 'Campagne introuvable.';
const SCHOOL_TYPES = sql`('preschool','primary','college','lycee','literacy_center','technical_center')`;
const DAY = 24 * 60 * 60 * 1000;

async function audit(db: Executor, userId: string, action: string, id: string, traceId?: string) {
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action,
    resourceType: 'exam_campaign',
    resourceId: id,
    decision: 'allow',
    reason: 'campagnes',
    traceId,
  });
}

export interface Reach {
  national: boolean;
  zones: CampaignZone[];
}

/** Zones où la personne peut lancer et piloter une campagne. */
export async function campaignReach(db: Executor, userId: string): Promise<Reach> {
  const { rows: roles } = await db.execute<{ role: string; id: string }>(sql`
    select m.role, m.organization_id as id from memberships m
     where m.user_id = ${userId}
       and m.role in ('superadministrateur', 'administrateur', 'direction-centrale', 'gestionnaire', 'iepp')
       and (m.valid_until is null or m.valid_until > now())`);
  const national = roles.some((r) =>
    ['superadministrateur', 'administrateur', 'direction-centrale'].includes(r.role),
  );
  const drenaIds = roles.filter((r) => r.role === 'gestionnaire').map((r) => r.id);
  const ieppIds = roles.filter((r) => r.role === 'iepp').map((r) => r.id);
  const where: SQL[] = [];
  if (national) where.push(sql`true`);
  if (drenaIds.length) {
    where.push(sql`o.id in ${drenaIds} or o.parent_id in ${drenaIds}`);
  }
  if (ieppIds.length) where.push(sql`o.id in ${ieppIds}`);
  if (where.length === 0) return { national: false, zones: [] };
  const { rows } = await db.execute<{ id: string; name: string; type: string }>(sql`
    select o.id, o.name, o.type from organizations o
     where o.type in ('authority', 'iepp') and not o.internal and o.archived_at is null
       and (${sql.join(where, sql` or `)})
     order by o.type, o.name`);
  return {
    national,
    zones: rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.type === 'iepp' ? ('iepp' as const) : ('drena' as const),
    })),
  };
}

export async function isCampaignLauncher(db: Executor, userId: string): Promise<boolean> {
  const reach = await campaignReach(db, userId);
  return reach.national || reach.zones.length > 0;
}

/** Écoles d'une zone (sous-requête) : tout le pays, une DRENA (et ce qui en dépend) ou une IEPP. */
export function zoneSchools(zoneId: string | null): SQL {
  if (zoneId === null) {
    return sql`(select o.id from organizations o
      where o.type in ${SCHOOL_TYPES} and not o.internal and o.archived_at is null)`;
  }
  return sql`(
    with recursive tree as (
      select o.id, o.type from organizations o where o.id = ${zoneId} and o.type = 'authority'
      union
      select c.id, c.type from organizations c join tree t on c.parent_id = t.id
    )
    select t.id from tree t join organizations o on o.id = t.id
     where o.type in ${SCHOOL_TYPES} and o.archived_at is null
    union
    select s.id from organizations i
      join organizations s on s.parent_id = i.parent_id and s.type in ('preschool', 'primary')
     where i.id = ${zoneId} and i.type = 'iepp' and s.archived_at is null
       and lower(trim(s.details->>'iepp')) = lower(trim(i.name)))`;
}

export function zoneOf(reach: Reach, zoneId: string | null): CampaignZone | null {
  if (zoneId === null)
    return reach.national ? { id: null, name: 'Tout le pays', kind: 'pays' } : null;
  return reach.zones.find((z) => z.id === zoneId) ?? null;
}

/** Classes concernées : celles du niveau, ouvertes, dans les écoles de la zone. */
async function targetCohorts(db: Executor, zoneId: string | null, level: LevelCode) {
  const { rows } = await db.execute<{ id: string; learners: number; org: string }>(sql`
    select c.id, c.organization_id as org,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners
      from cohorts c
     where c.level = ${level} and c.archived_at is null
       and c.organization_id in ${zoneSchools(zoneId)}`);
  return rows;
}

export async function campaignOptions(db: Database, userId: string): Promise<CampaignOptions> {
  const reach = await campaignReach(db, userId);
  if (!reach.national && reach.zones.length === 0) return { zones: [], exams: [] };
  const zones: CampaignZone[] = [
    ...(reach.national ? [{ id: null, name: 'Tout le pays', kind: 'pays' as const }] : []),
    ...reach.zones,
  ];
  // Épreuves : celles que la personne voit dans sa banque, et celles des structures de ses zones.
  const mine = await listExams(db, userId);
  const zoneIds = reach.zones.map((z) => z.id!);
  const scope = reach.national
    ? sql`true`
    : sql.join(
        [
          sql`e.organization_id in ${zoneIds}`,
          ...zoneIds.map((z) => sql`e.organization_id in ${zoneSchools(z)}`),
        ],
        sql` or `,
      );
  const { rows } = await db.execute<{
    id: string;
    title: string;
    item_count: number;
    organization: string;
  }>(sql`
    select e.id, e.title, o.name as organization,
      (select count(*)::int from exam_items i where i.exam_id = e.id) as item_count
      from exams e join organizations o on o.id = e.organization_id
     where (${scope})
     order by e.created_at desc limit 200`);
  const byId = new Map<string, CampaignOptions['exams'][number]>();
  for (const e of mine) {
    byId.set(e.id, {
      id: e.id,
      title: e.title,
      itemCount: e.itemCount,
      organization: e.organization.name,
    });
  }
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      title: r.title,
      itemCount: r.item_count,
      organization: r.organization,
    });
  }
  return { zones, exams: [...byId.values()].filter((e) => e.itemCount >= 4) };
}

export async function previewCampaign(
  db: Database,
  userId: string,
  zoneId: string | null,
  level: LevelCode,
): Promise<CampaignPreview> {
  const reach = await campaignReach(db, userId);
  if (!zoneOf(reach, zoneId)) throw new ExerciseError('forbidden', 'Zone hors de votre portée.');
  const cohorts = await targetCohorts(db, zoneId, level);
  return {
    schools: new Set(cohorts.map((c) => c.org)).size,
    classes: cohorts.length,
    learners: cohorts.reduce((a, c) => a + c.learners, 0),
  };
}

const dayStart = (date: string) => new Date(`${date}T00:00:00Z`);

export async function createCampaign(
  db: Database,
  userId: string,
  input: CreateCampaignInput,
  traceId?: string,
): Promise<{ id: string; classes: number }> {
  const reach = await campaignReach(db, userId);
  const zone = zoneOf(reach, input.zoneId);
  if (!zone)
    throw new ExerciseError('forbidden', 'Vous ne lancez pas de campagne dans cette zone.');
  const options = await campaignOptions(db, userId);
  if (!options.exams.some((e) => e.id === input.examId)) {
    throw new ExerciseError('invalid', 'Choisissez une épreuve d’au moins quatre questions.');
  }
  const startsAt = dayStart(input.startsAt);
  const endsAt = new Date(dayStart(input.endsAt).getTime() + DAY);
  if (endsAt.getTime() <= Date.now()) {
    throw new ExerciseError('invalid', 'La date de fin est déjà passée.');
  }
  const cohorts = await targetCohorts(db, input.zoneId, input.level);
  if (cohorts.length === 0) {
    throw new ExerciseError(
      'invalid',
      `Aucune classe de ${levelLabel(input.level)} dans cette zone : rien à lancer.`,
    );
  }
  const items = await examItemList(db, input.examId);
  const [exam] = await db.select().from(exams).where(eq(exams.id, input.examId));
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  const instructions =
    `Évaluation ${zone.kind === 'pays' ? 'nationale' : `de la zone ${zone.name}`} : ` +
    `${items.length} questions, environ ${exam!.durationMinutes} minutes, ` +
    `du ${fmt(startsAt)} au ${fmt(new Date(endsAt.getTime() - DAY))}. Réponds seul, sans aide. ` +
    'Ta note sera visible à la fin de l’évaluation.';
  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(examCampaigns)
      .values({
        examId: input.examId,
        title: input.title,
        zoneId: input.zoneId,
        level: input.level,
        startsAt,
        endsAt,
        createdBy: userId,
      })
      .returning({ id: examCampaigns.id });
    for (let i = 0; i < cohorts.length; i += 500) {
      const chunk = cohorts.slice(i, i + 500);
      const made = await tx
        .insert(assignments)
        .values(
          chunk.map((c) => ({
            cohortId: c.id,
            createdByUserId: userId,
            title: input.title,
            instructions,
            // Affiché « à rendre avant le … à 23 h 59 » le dernier jour.
            dueAt: new Date(endsAt.getTime() - 60_000),
            maxScore: 100,
            examId: input.examId,
            campaignId: campaign!.id,
            opensAt: startsAt,
            resultsAt: endsAt,
          })),
        )
        .returning({ id: assignments.id });
      const links = made.flatMap((a) =>
        items.map((it, position) => ({ assignmentId: a.id, exerciseId: it.exerciseId, position })),
      );
      for (let j = 0; j < links.length; j += 2000) {
        await tx.insert(assignmentExercises).values(links.slice(j, j + 2000));
      }
    }
    await audit(tx, userId, 'campaign.create', campaign!.id, traceId);
    return { id: campaign!.id, classes: cohorts.length };
  });
}

export type CampaignRow = typeof examCampaigns.$inferSelect;

export function statusOf(c: CampaignRow): CampaignStatus {
  const now = Date.now();
  if (c.closedAt || c.endsAt.getTime() <= now) return 'close';
  return c.startsAt.getTime() > now ? 'a-venir' : 'en-cours';
}

export function canPilot(c: CampaignRow, userId: string, reach: Reach): boolean {
  if (c.createdBy === userId || reach.national) return true;
  return c.zoneId !== null && reach.zones.some((z) => z.id === c.zoneId);
}

export async function summaries(db: Executor, where: SQL): Promise<CampaignSummary[]> {
  const { rows } = await db.execute<{
    id: string;
    title: string;
    zone_id: string | null;
    zone_name: string | null;
    zone_type: string | null;
    level: string;
    starts_at: string;
    ends_at: string;
    closed_at: string | null;
    exam_id: string;
    exam_title: string;
    question_count: number;
    threshold: number;
    created_by: string | null;
    classes: number;
    learners: number;
    submitted: number;
  }>(sql`
    select k.id, k.title, k.zone_id, z.name as zone_name, z.type as zone_type, k.level,
      k.starts_at, k.ends_at, k.closed_at, e.id as exam_id, e.title as exam_title,
      (select count(*)::int from exam_items i where i.exam_id = e.id) as question_count,
      e.threshold, u.display_name as created_by,
      (select count(*)::int from assignments a where a.campaign_id = k.id) as classes,
      (select count(*)::int from assignments a join cohort_members cm on cm.cohort_id = a.cohort_id
        where a.campaign_id = k.id and cm.role = 'apprenant') as learners,
      (select count(*)::int from assignments a join assignment_submissions s on s.assignment_id = a.id
        where a.campaign_id = k.id) as submitted
      from exam_campaigns k
      join exams e on e.id = k.exam_id
      left join organizations z on z.id = k.zone_id
      left join users u on u.id = k.created_by
     where ${where}
     order by k.starts_at desc
     limit 100`);
  return rows.map((r) => {
    const row = {
      closedAt: r.closed_at ? new Date(r.closed_at) : null,
      endsAt: new Date(r.ends_at),
      startsAt: new Date(r.starts_at),
    } as CampaignRow;
    return {
      id: r.id,
      title: r.title,
      exam: {
        id: r.exam_id,
        title: r.exam_title,
        questionCount: r.question_count,
        threshold: r.threshold,
      },
      zone: r.zone_id
        ? {
            id: r.zone_id,
            name: r.zone_name ?? '',
            kind: r.zone_type === 'iepp' ? 'iepp' : 'drena',
          }
        : { id: null, name: 'Tout le pays', kind: 'pays' },
      level: r.level as LevelCode,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: statusOf(row),
      classes: r.classes,
      learners: r.learners,
      submitted: r.submitted,
      createdBy: r.created_by,
    };
  });
}

/** Les campagnes qu'on pilote, et celles où l'on a des classes. */
export async function listCampaigns(
  db: Database,
  userId: string,
): Promise<{ piloted: CampaignSummary[]; classes: CampaignSummary[]; canLaunch: boolean }> {
  const reach = await campaignReach(db, userId);
  const zoneIds = reach.zones.map((z) => z.id!);
  const pilotWhere = reach.national
    ? sql`true`
    : zoneIds.length
      ? sql`(k.created_by = ${userId} or k.zone_id in ${zoneIds})`
      : sql`k.created_by = ${userId}`;
  const piloted = await summaries(db, pilotWhere);
  const classes = await summaries(
    db,
    sql`k.id in (select a.campaign_id from assignments a
      where a.campaign_id is not null and a.cohort_id in ${managedCohorts(userId)})`,
  );
  return {
    piloted,
    classes: classes.filter((c) => !piloted.some((p) => p.id === c.id)),
    canLaunch: reach.national || reach.zones.length > 0,
  };
}

/** Classes que la personne enseigne ou dont elle dirige l'école (sous-requête). */
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

export async function loadCampaign(db: Executor, id: string): Promise<CampaignRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ExerciseError('not_found', NOT_FOUND);
  const [row] = await db.select().from(examCampaigns).where(eq(examCampaigns.id, id));
  if (!row) throw new ExerciseError('not_found', NOT_FOUND);
  return row;
}

async function myClasses(db: Database, userId: string, id: string): Promise<CampaignClass[]> {
  const { rows } = await db.execute<{
    assignment_id: string;
    cohort_id: string;
    cohort_name: string;
    school: string;
    on_paper: boolean;
    learners: number;
    submitted: number;
  }>(sql`
    select a.id as assignment_id, c.id as cohort_id, c.name as cohort_name, o.name as school,
      a.on_paper,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners,
      (select count(*)::int from assignment_submissions s where s.assignment_id = a.id) as submitted
      from assignments a
      join cohorts c on c.id = a.cohort_id
      join organizations o on o.id = c.organization_id
     where a.campaign_id = ${id} and a.cohort_id in ${managedCohorts(userId)}
     order by o.name, c.name
     limit 200`);
  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    cohortId: r.cohort_id,
    cohortName: r.cohort_name,
    school: r.school,
    onPaper: r.on_paper,
    learners: r.learners,
    submitted: r.submitted,
  }));
}

export async function getCampaign(
  db: Database,
  userId: string,
  id: string,
): Promise<CampaignDetail> {
  const row = await loadCampaign(db, id);
  const reach = await campaignReach(db, userId);
  const pilot = canPilot(row, userId, reach);
  const mine = await myClasses(db, userId, id);
  if (!pilot && mine.length === 0) throw new ExerciseError('not_found', NOT_FOUND);
  const [summary] = await summaries(db, sql`k.id = ${id}`);
  let schools: CampaignSchoolRow[] = [];
  let groups: CampaignDetail['groups'] = [];
  let groupLabel: string | null = null;
  if (pilot) {
    const zoneType = summary!.zone.kind;
    groupLabel = zoneType === 'pays' ? 'DRENA' : zoneType === 'drena' ? 'IEPP' : null;
    const { rows } = await db.execute<{
      id: string;
      name: string;
      group: string;
      classes: number;
      learners: number;
      submitted: number;
    }>(sql`
      select o.id, o.name,
        ${zoneType === 'pays' ? sql`coalesce(p.name, 'Sans DRENA')` : sql`coalesce(nullif(trim(o.details->>'iepp'), ''), 'Sans IEPP')`} as "group",
        count(a.id)::int as classes,
        coalesce(sum((select count(*) from cohort_members cm
          where cm.cohort_id = a.cohort_id and cm.role = 'apprenant')), 0)::int as learners,
        coalesce(sum((select count(*) from assignment_submissions s
          where s.assignment_id = a.id)), 0)::int as submitted
        from assignments a
        join cohorts c on c.id = a.cohort_id
        join organizations o on o.id = c.organization_id
        left join organizations p on p.id = o.parent_id
       where a.campaign_id = ${id}
       group by o.id, o.name, 3
       order by o.name`);
    schools = rows;
    if (groupLabel) {
      const map = new Map<string, CampaignDetail['groups'][number]>();
      for (const s of rows) {
        const g = map.get(s.group) ?? { name: s.group, schools: 0, learners: 0, submitted: 0 };
        g.schools += 1;
        g.learners += s.learners;
        g.submitted += s.submitted;
        map.set(s.group, g);
      }
      groups = [...map.values()].sort(
        (a, b) => a.submitted / (a.learners || 1) - b.submitted / (b.learners || 1),
      );
    }
  }
  return { ...summary!, canPilot: pilot, groupLabel, groups, schools, myClasses: mine };
}

async function classOf(db: Database, userId: string, id: string, cohortId: string) {
  const row = await loadCampaign(db, id);
  const [a] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.campaignId, id), eq(assignments.cohortId, cohortId)));
  if (!a || !(await canManageCohort(db, userId, cohortId))) {
    throw new ExerciseError('not_found', 'Cette classe ne fait pas partie de la campagne.');
  }
  return { row, assignment: a };
}

/** L'école choisit « en ligne » ou « papier » pour une classe, tant qu'aucune copie n'est rendue. */
export async function setCampaignMode(
  db: Database,
  userId: string,
  id: string,
  cohortId: string,
  onPaper: boolean,
  traceId?: string,
): Promise<void> {
  const { row, assignment } = await classOf(db, userId, id, cohortId);
  if (statusOf(row) === 'close') throw new ExerciseError('invalid', 'La campagne est close.');
  const [sub] = await db
    .select({ id: assignmentSubmissions.id })
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.assignmentId, assignment.id))
    .limit(1);
  if (sub) {
    throw new ExerciseError('invalid', 'Des copies sont déjà rendues : le mode ne change plus.');
  }
  await db.update(assignments).set({ onPaper }).where(eq(assignments.id, assignment.id));
  await audit(db, userId, 'campaign.mode', id, traceId);
}

export async function campaignPaperSheet(
  db: Database,
  userId: string,
  id: string,
  cohortId: string,
) {
  const { row } = await classOf(db, userId, id, cohortId);
  return examPaperSheet(db, userId, row.examId, cohortId, id);
}

export async function saveCampaignPaper(
  db: Database,
  userId: string,
  id: string,
  input: SaveExamPaperInput,
  traceId?: string,
) {
  const { row } = await classOf(db, userId, id, input.cohortId);
  if (statusOf(row) === 'close') throw new ExerciseError('invalid', 'La campagne est close.');
  if (statusOf(row) === 'a-venir') {
    throw new ExerciseError('invalid', 'La campagne n’a pas encore commencé.');
  }
  return saveExamPaper(db, userId, row.examId, input, traceId, id);
}

/** Livret de la campagne : pour qui la pilote ou y a une classe. */
export async function campaignBooklet(db: Database, userId: string, id: string) {
  const row = await loadCampaign(db, id);
  const pilot = canPilot(row, userId, await campaignReach(db, userId));
  if (!pilot && (await myClasses(db, userId, id)).length === 0) {
    throw new ExerciseError('not_found', NOT_FOUND);
  }
  const [exam] = await db.select().from(exams).where(eq(exams.id, row.examId));
  return { campaign: { id: row.id, title: row.title }, ...(await bookletOf(db, exam!)) };
}

async function loadForPilot(db: Database, userId: string, id: string) {
  const row = await loadCampaign(db, id);
  if (!canPilot(row, userId, await campaignReach(db, userId))) {
    throw new ExerciseError('not_found', NOT_FOUND);
  }
  return row;
}

/** Clôture avancée : les notes s'ouvrent tout de suite. */
export async function closeCampaign(
  db: Database,
  userId: string,
  id: string,
  traceId?: string,
): Promise<void> {
  const row = await loadForPilot(db, userId, id);
  if (statusOf(row) === 'close') return;
  await db.transaction(async (tx) => {
    await tx
      .update(examCampaigns)
      .set({ closedAt: sql`now()` })
      .where(eq(examCampaigns.id, id));
    await tx
      .update(assignments)
      .set({ resultsAt: sql`now()` })
      .where(eq(assignments.campaignId, id));
    await audit(tx, userId, 'campaign.close', id, traceId);
  });
}

/** Une campagne sans aucune copie se supprime (erreur de lancement). */
export async function deleteCampaign(
  db: Database,
  userId: string,
  id: string,
  traceId?: string,
): Promise<void> {
  await loadForPilot(db, userId, id);
  const [sub] = await db
    .select({ id: assignmentSubmissions.id })
    .from(assignmentSubmissions)
    .innerJoin(assignments, eq(assignments.id, assignmentSubmissions.assignmentId))
    .where(eq(assignments.campaignId, id))
    .limit(1);
  if (sub) {
    throw new ExerciseError(
      'conflict',
      'Des copies sont rendues : la campagne reste. Clôturez-la.',
    );
  }
  await db.delete(examCampaigns).where(eq(examCampaigns.id, id));
  await audit(db, userId, 'campaign.delete', id, traceId);
}

/** Pour le menu : la personne lance des campagnes, ou en a dans ses classes. */
export async function hasCampaigns(db: Executor, userId: string): Promise<boolean> {
  if (await isCampaignLauncher(db, userId)) return true;
  const { rows } = await db.execute(sql`
    select 1 from assignments a
     where a.campaign_id is not null and a.cohort_id in ${managedCohorts(userId)} limit 1`);
  return rows.length > 0;
}
