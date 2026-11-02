import {
  levelLabel,
  STATS_THRESHOLD,
  type CampaignStatus,
  type CreateOralCampaignInput,
  type LevelCode,
  type OralCampaignClass,
  type OralCampaignDetail,
  type OralCampaignList,
  type OralCampaignOptions,
  type OralCampaignParticipation,
  type OralCampaignResultRow,
  type OralCampaignResults,
  type OralCampaignSummary,
  type OralPartScore,
  type OralSubject,
} from '@lenseignement/types';
import { eq, sql, type SQL } from 'drizzle-orm';
import { statsOrganizationIds } from '../access/access.service.js';
import type { Database, Executor } from '../db/database.js';
import { auditLogs, oralCampaignClasses, oralCampaigns, oralTests } from '../db/schema.js';
import { campaignReach, zoneOf, zoneSchools, type Reach } from '../exams/campaigns.js';
import { ExerciseError } from '../exercises/exercises.js';
import { listOralBenchmarks, runnableCohorts, summarizeOral } from './oral.js';

/**
 * Campagnes orales de zone (étape 5b, plan validé par GOHH le 02/11/2026).
 * - Mêmes lanceurs que les campagnes écrites : superadministrateur, administrateur, directions
 *   centrales (pays ou zone), gestionnaire (sa DRENA), IEPP (ses écoles).
 * - Toutes les classes du niveau dans les écoles de la zone, fixées au lancement. Les enseignants
 *   font passer l'épreuve orale dans leurs classes pendant la période.
 * - L'enseignant voit les scores de sa classe tout de suite (il les a notés) ; les chiffres de la
 *   zone s'ouvrent à la clôture, sans nom d'élève, et seulement à partir de 5 élèves.
 */

const NOT_FOUND = 'Campagne orale introuvable.';
const DAY = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f-]{36}$/i;

type CampaignRow = typeof oralCampaigns.$inferSelect;

async function audit(db: Executor, userId: string, action: string, id: string, traceId?: string) {
  await db.insert(auditLogs).values({
    actorUserId: userId,
    action,
    resourceType: 'oral_campaign',
    resourceId: id,
    decision: 'allow',
    reason: 'campagnes-orales',
    traceId,
  });
}

function statusOf(c: { closedAt: Date | null; startsAt: Date; endsAt: Date }): CampaignStatus {
  const now = Date.now();
  if (c.closedAt || c.endsAt.getTime() <= now) return 'close';
  return c.startsAt.getTime() > now ? 'a-venir' : 'en-cours';
}

function canPilot(c: CampaignRow, userId: string, reach: Reach): boolean {
  if (c.createdBy === userId || reach.national) return true;
  return c.zoneId !== null && reach.zones.some((z) => z.id === c.zoneId);
}

function pilotWhere(userId: string, reach: Reach): SQL {
  const zoneIds = reach.zones.map((z) => z.id!);
  if (reach.national) return sql`true`;
  return zoneIds.length
    ? sql`(k.created_by = ${userId} or k.zone_id in ${zoneIds})`
    : sql`k.created_by = ${userId}`;
}

async function loadCampaign(db: Executor, id: string): Promise<CampaignRow> {
  if (!UUID.test(id)) throw new ExerciseError('not_found', NOT_FOUND);
  const [row] = await db.select().from(oralCampaigns).where(eq(oralCampaigns.id, id));
  if (!row) throw new ExerciseError('not_found', NOT_FOUND);
  return row;
}

export async function oralCampaignOptions(
  db: Database,
  userId: string,
): Promise<OralCampaignOptions> {
  const reach = await campaignReach(db, userId);
  if (!reach.national && reach.zones.length === 0) return { zones: [], tests: [] };
  const { rows } = await db.execute<{
    id: string;
    title: string;
    level: string;
    organization: string;
  }>(sql`
    select t.id, t.title, t.level, o.name as organization
      from oral_tests t join organizations o on o.id = t.organization_id
     where t.status = 'publiee' order by t.published_at desc limit 200`);
  return {
    zones: [
      ...(reach.national ? [{ id: null, name: 'Tout le pays', kind: 'pays' as const }] : []),
      ...reach.zones,
    ],
    tests: rows.map((r) => ({ ...r, level: r.level as LevelCode })),
  };
}

const dayStart = (date: string) => new Date(`${date}T00:00:00Z`);

export async function createOralCampaign(
  db: Database,
  userId: string,
  input: CreateOralCampaignInput,
  traceId?: string,
): Promise<{ id: string; classes: number }> {
  const reach = await campaignReach(db, userId);
  if (!zoneOf(reach, input.zoneId)) {
    throw new ExerciseError('forbidden', 'Vous ne lancez pas de campagne dans cette zone.');
  }
  const [test] = await db
    .select({ status: oralTests.status })
    .from(oralTests)
    .where(eq(oralTests.id, input.testId));
  if (!test || test.status !== 'publiee') {
    throw new ExerciseError('invalid', 'Choisissez une épreuve orale publiée.');
  }
  const startsAt = dayStart(input.startsAt);
  const endsAt = new Date(dayStart(input.endsAt).getTime() + DAY);
  if (endsAt.getTime() <= Date.now()) {
    throw new ExerciseError('invalid', 'La date de fin est déjà passée.');
  }
  const { rows: cohorts } = await db.execute<{ id: string }>(sql`
    select c.id from cohorts c
     where c.level = ${input.level} and c.archived_at is null
       and c.organization_id in ${zoneSchools(input.zoneId)}`);
  if (cohorts.length === 0) {
    throw new ExerciseError(
      'invalid',
      `Aucune classe de ${levelLabel(input.level)} dans cette zone : rien à lancer.`,
    );
  }
  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(oralCampaigns)
      .values({
        testId: input.testId,
        title: input.title,
        zoneId: input.zoneId,
        level: input.level,
        startsAt,
        endsAt,
        createdBy: userId,
      })
      .returning({ id: oralCampaigns.id });
    for (let i = 0; i < cohorts.length; i += 1000) {
      await tx
        .insert(oralCampaignClasses)
        .values(
          cohorts.slice(i, i + 1000).map((c) => ({ campaignId: campaign!.id, cohortId: c.id })),
        );
    }
    await audit(tx, userId, 'oral-campaign.create', campaign!.id, traceId);
    return { id: campaign!.id, classes: cohorts.length };
  });
}

async function summaries(db: Executor, where: SQL): Promise<OralCampaignSummary[]> {
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
    test_id: string;
    test_title: string;
    subject: string;
    created_by: string | null;
    classes: number;
    learners: number;
    evaluated: number;
  }>(sql`
    select k.id, k.title, k.zone_id, z.name as zone_name, z.type as zone_type, k.level,
      k.starts_at, k.ends_at, k.closed_at, t.id as test_id, t.title as test_title, t.subject,
      u.display_name as created_by,
      (select count(*)::int from oral_campaign_classes x where x.campaign_id = k.id) as classes,
      (select count(*)::int from oral_campaign_classes x
         join cohort_members cm on cm.cohort_id = x.cohort_id
        where x.campaign_id = k.id and cm.role = 'apprenant') as learners,
      (select count(*)::int from oral_results r where r.campaign_id = k.id) as evaluated
      from oral_campaigns k
      join oral_tests t on t.id = k.test_id
      left join organizations z on z.id = k.zone_id
      left join users u on u.id = k.created_by
     where ${where}
     order by k.starts_at desc
     limit 100`);
  return rows.map((r) => {
    const dates = {
      closedAt: r.closed_at ? new Date(r.closed_at) : null,
      startsAt: new Date(r.starts_at),
      endsAt: new Date(r.ends_at),
    };
    return {
      id: r.id,
      title: r.title,
      test: { id: r.test_id, title: r.test_title, subject: r.subject as OralSubject },
      zone: r.zone_id
        ? {
            id: r.zone_id,
            name: r.zone_name ?? '',
            kind: r.zone_type === 'iepp' ? ('iepp' as const) : ('drena' as const),
          }
        : { id: null, name: 'Tout le pays', kind: 'pays' as const },
      level: r.level as LevelCode,
      startsAt: dates.startsAt.toISOString(),
      endsAt: dates.endsAt.toISOString(),
      status: statusOf(dates),
      classes: r.classes,
      learners: r.learners,
      evaluated: r.evaluated,
      createdBy: r.created_by,
    };
  });
}

/** Classes d'une campagne où la personne fait passer, avec leur avancement. */
async function myCampaignClasses(
  db: Executor,
  userId: string,
  campaignIds: string[],
): Promise<Map<string, OralCampaignClass[]>> {
  const out = new Map<string, OralCampaignClass[]>();
  if (campaignIds.length === 0) return out;
  const { rows } = await db.execute<{
    campaign_id: string;
    cohort_id: string;
    cohort_name: string;
    school: string;
    learners: number;
    evaluated: number;
  }>(sql`
    select x.campaign_id, c.id as cohort_id, c.name as cohort_name, o.name as school,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners,
      (select count(*)::int from oral_results r
        where r.campaign_id = x.campaign_id and r.cohort_id = c.id) as evaluated
      from oral_campaign_classes x
      join cohorts c on c.id = x.cohort_id
      join organizations o on o.id = c.organization_id
     where x.campaign_id in ${campaignIds} and c.id in ${runnableCohorts(userId)}
     order by o.name, c.name`);
  for (const r of rows) {
    const list = out.get(r.campaign_id) ?? [];
    list.push({
      cohortId: r.cohort_id,
      cohortName: r.cohort_name,
      school: r.school,
      learners: r.learners,
      evaluated: r.evaluated,
    });
    out.set(r.campaign_id, list);
  }
  return out;
}

/** Campagnes en cours ou à venir dans les classes de la personne. */
export async function myOralCampaigns(
  db: Executor,
  userId: string,
): Promise<OralCampaignList['classes']> {
  const list = await summaries(
    db,
    sql`(k.closed_at is null and k.ends_at > now()) and k.id in (
      select x.campaign_id from oral_campaign_classes x
       where x.cohort_id in ${runnableCohorts(userId)})`,
  );
  const mine = await myCampaignClasses(
    db,
    userId,
    list.map((c) => c.id),
  );
  return list.map((c) => ({ ...c, myClasses: mine.get(c.id) ?? [] }));
}

export async function listOralCampaigns(db: Database, userId: string): Promise<OralCampaignList> {
  const reach = await campaignReach(db, userId);
  const piloted = await summaries(db, pilotWhere(userId, reach));
  const classes = (await myOralCampaigns(db, userId)).filter(
    (c) => !piloted.some((p) => p.id === c.id),
  );
  return { piloted, classes, canLaunch: reach.national || reach.zones.length > 0 };
}

/** Menu « Campagnes » : a des campagnes orales dans ses classes. */
export async function hasOralCampaigns(db: Executor, userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`
    select 1 from oral_campaign_classes x
     where x.cohort_id in ${runnableCohorts(userId)} limit 1`);
  return rows.length > 0;
}

interface ClassRow extends Record<string, unknown> {
  cohort_id: string;
  school_id: string;
  school: string;
  drena: string | null;
  iepp: string | null;
  learners: number;
}

async function campaignClasses(db: Executor, id: string, scope: SQL): Promise<ClassRow[]> {
  const { rows } = await db.execute<ClassRow>(sql`
    select c.id as cohort_id, o.id as school_id, o.name as school, p.name as drena,
      nullif(trim(o.details->>'iepp'), '') as iepp,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners
      from oral_campaign_classes x
      join cohorts c on c.id = x.cohort_id
      join organizations o on o.id = c.organization_id
      left join organizations p on p.id = o.parent_id
     where x.campaign_id = ${id} and ${scope}`);
  return rows;
}

function grouping(summary: OralCampaignSummary) {
  const label =
    summary.zone.kind === 'pays' ? 'DRENA' : summary.zone.kind === 'drena' ? 'IEPP' : null;
  const of = (c: ClassRow) =>
    label === 'DRENA' ? (c.drena ?? 'Sans DRENA') : (c.iepp ?? 'Sans IEPP');
  return { label, of };
}

export async function getOralCampaign(
  db: Database,
  userId: string,
  id: string,
): Promise<OralCampaignDetail> {
  const row = await loadCampaign(db, id);
  const pilot = canPilot(row, userId, await campaignReach(db, userId));
  const mine = (await myCampaignClasses(db, userId, [id])).get(id) ?? [];
  if (!pilot && mine.length === 0) throw new ExerciseError('not_found', NOT_FOUND);
  const [summary] = await summaries(db, sql`k.id = ${id}`);
  const base = { ...summary!, canPilot: pilot, myClasses: mine };
  if (!pilot) return { ...base, groupLabel: null, groups: [], schools: [] };
  const classes = await campaignClasses(db, id, sql`true`);
  const { rows: counts } = await db.execute<{ cohort_id: string; n: number }>(sql`
    select r.cohort_id, count(*)::int as n from oral_results r
     where r.campaign_id = ${id} group by r.cohort_id`);
  const evaluated = new Map(counts.map((c) => [c.cohort_id, c.n]));
  const g = grouping(summary!);
  const rowOf = (key: string, name: string, group: string, cls: ClassRow[]) =>
    ({
      id: key,
      name,
      group,
      classes: cls.length,
      learners: cls.reduce((a, c) => a + c.learners, 0),
      evaluated: cls.reduce((a, c) => a + (evaluated.get(c.cohort_id) ?? 0), 0),
    }) satisfies OralCampaignParticipation;
  const rate = (r: OralCampaignParticipation) => (r.learners ? r.evaluated / r.learners : 1);
  const schools = [...new Set(classes.map((c) => c.school_id))]
    .map((sid) => {
      const cls = classes.filter((c) => c.school_id === sid);
      return rowOf(sid, cls[0]!.school, g.label ? g.of(cls[0]!) : '', cls);
    })
    .sort((a, b) => rate(a) - rate(b) || a.name.localeCompare(b.name, 'fr'));
  const groups = g.label
    ? [...new Set(classes.map(g.of))]
        .map((name) =>
          rowOf(
            name,
            name,
            '',
            classes.filter((c) => g.of(c) === name),
          ),
        )
        .sort((a, b) => rate(a) - rate(b) || a.name.localeCompare(b.name, 'fr'))
    : [];
  return { ...base, groupLabel: g.label, groups, schools };
}

async function loadForPilot(db: Database, userId: string, id: string) {
  const row = await loadCampaign(db, id);
  if (!canPilot(row, userId, await campaignReach(db, userId))) {
    throw new ExerciseError('forbidden', 'Seuls ceux qui pilotent la campagne la modifient.');
  }
  return row;
}

export async function closeOralCampaign(
  db: Database,
  userId: string,
  id: string,
  traceId?: string,
) {
  const row = await loadForPilot(db, userId, id);
  if (statusOf(row) === 'close') return;
  await db.update(oralCampaigns).set({ closedAt: new Date() }).where(eq(oralCampaigns.id, id));
  await audit(db, userId, 'oral-campaign.close', id, traceId);
}

export async function deleteOralCampaign(
  db: Database,
  userId: string,
  id: string,
  traceId?: string,
) {
  await loadForPilot(db, userId, id);
  const { rows } = await db.execute(
    sql`select 1 from oral_results where campaign_id = ${id} limit 1`,
  );
  if (rows.length > 0) {
    throw new ExerciseError(
      'conflict',
      'Des élèves ont déjà été évalués : clôturez la campagne au lieu de la supprimer.',
    );
  }
  await db.delete(oralCampaigns).where(eq(oralCampaigns.id, id));
  await audit(db, userId, 'oral-campaign.delete', id, traceId);
}

/** Campagne ouverte maintenant pour cette épreuve et cette classe (le résultat y est compté). */
export async function openOralCampaign(
  db: Executor,
  testId: string,
  cohortId: string,
): Promise<string | null> {
  const { rows } = await db.execute<{ id: string }>(sql`
    select k.id from oral_campaigns k
      join oral_campaign_classes x on x.campaign_id = k.id and x.cohort_id = ${cohortId}
     where k.test_id = ${testId} and k.closed_at is null
       and k.starts_at <= now() and k.ends_at > now()
     order by k.starts_at desc limit 1`);
  return rows[0]?.id ?? null;
}

/** Campagne close à laquelle appartient déjà ce résultat (on ne le remplace plus). */
export async function closedCampaignOf(db: Executor, campaignId: string | null) {
  if (!campaignId) return false;
  const row = await loadCampaign(db, campaignId);
  return statusOf(row) === 'close';
}

/** Campagnes orales visibles dans les statistiques : pilotées, ou passées dans ses structures. */
export async function statsOralCampaigns(
  db: Database,
  userId: string,
): Promise<OralCampaignSummary[]> {
  const reach = await campaignReach(db, userId);
  return summaries(
    db,
    sql`(${pilotWhere(userId, reach)} or k.id in (
      select x.campaign_id from oral_campaign_classes x join cohorts c on c.id = x.cohort_id
       where c.organization_id in ${statsOrganizationIds(userId)}))`,
  );
}

export async function oralCampaignResults(
  db: Database,
  userId: string,
  id: string,
): Promise<OralCampaignResults> {
  const row = await loadCampaign(db, id);
  const pilot = canPilot(row, userId, await campaignReach(db, userId));
  const classes = await campaignClasses(
    db,
    id,
    pilot ? sql`true` : sql`c.organization_id in ${statsOrganizationIds(userId)}`,
  );
  if (!pilot && classes.length === 0) throw new ExerciseError('not_found', NOT_FOUND);
  if (statusOf(row) !== 'close') {
    throw new ExerciseError('invalid', 'Les résultats s’ouvrent à la clôture de la campagne.');
  }
  const [summary] = await summaries(db, sql`k.id = ${id}`);
  const [test] = await db.select().from(oralTests).where(eq(oralTests.id, row.testId));
  const benchmark =
    (await listOralBenchmarks(db)).find(
      (b) => b.level === test!.level && b.subject === test!.subject,
    ) ?? null;
  const { rows: results } = classes.length
    ? await db.execute<{ cohort_id: string; scores: OralPartScore[] }>(sql`
        select r.cohort_id, r.scores from oral_results r
         where r.campaign_id = ${id} and r.cohort_id in ${classes.map((c) => c.cohort_id)}`)
    : { rows: [] };
  const parts = test!.parts;
  const enough = (n: number) => n >= STATS_THRESHOLD;
  const all = summarizeOral(
    parts,
    benchmark,
    results.map((r) => r.scores),
  );
  const g = grouping(summary!);
  const rowOf = (key: string, name: string, group: string, cls: ClassRow[]) => {
    const ids = new Set(cls.map((c) => c.cohort_id));
    const list = results.filter((r) => ids.has(r.cohort_id)).map((r) => r.scores);
    const sum = summarizeOral(parts, benchmark, list);
    const ok = enough(list.length);
    return {
      id: key,
      name,
      group,
      expected: cls.reduce((a, c) => a + c.learners, 0),
      evaluated: list.length,
      median: ok ? sum.median : null,
      zeroRate: ok ? sum.zeroRate : null,
      benchmarkRate: ok ? sum.benchmarkRate : null,
    } satisfies OralCampaignResultRow;
  };
  // Les plus fragiles d'abord : pas d'élève évalué, puis trop peu, puis la médiane la plus basse.
  const sortRows = (a: OralCampaignResultRow, b: OralCampaignResultRow) => {
    const key = (r: OralCampaignResultRow) =>
      r.evaluated === 0 ? -2 : r.median === null ? -1 : r.median;
    return key(a) - key(b) || a.name.localeCompare(b.name, 'fr');
  };
  const schools = [...new Set(classes.map((c) => c.school_id))]
    .map((sid) => {
      const cls = classes.filter((c) => c.school_id === sid);
      return rowOf(sid, cls[0]!.school, g.label ? g.of(cls[0]!) : '', cls);
    })
    .sort(sortRows);
  const groups = g.label
    ? [...new Set(classes.map(g.of))]
        .map((name) =>
          rowOf(
            name,
            name,
            '',
            classes.filter((c) => g.of(c) === name),
          ),
        )
        .sort(sortRows)
    : [];
  const ok = enough(results.length);
  return {
    campaign: summary!,
    scope: pilot ? 'campagne' : 'ma-zone',
    groupLabel: g.label,
    benchmark,
    reference: { title: parts[all.reference]!.title, unit: all.unit },
    expected: classes.reduce((a, c) => a + c.learners, 0),
    evaluated: results.length,
    median: ok ? all.median : null,
    zeroRate: ok ? all.zeroRate : null,
    benchmarkRate: ok ? all.benchmarkRate : null,
    bands: ok ? all.bands : [],
    byPart: ok ? all.byPart : [],
    groups,
    schools,
  };
}
