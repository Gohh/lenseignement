import {
  PILOT_CYCLE_LABELS,
  PILOT_CYCLES,
  pilotState,
  STATS_THRESHOLD,
  type PilotAlert,
  type PilotCycle,
  type PilotOverview,
  type PilotPeriod,
  type PilotZoneRow,
} from '@lenseignement/types';
import { sql, type SQL } from 'drizzle-orm';
import { statsOrganizationIds } from '../access/access.service.js';
import type { Executor } from '../db/database.js';
import { TeamError } from '../team/team.js';
import { mask, percent } from './stats.js';

/**
 * Tableau de pilotage (aucun nom d'élève) : chiffres d'une zone, pour un cycle et une période,
 * comparés à la période d'avant ; sous-zones les plus fragiles d'abord ; points d'attention.
 * Les seuls noms qui sortent d'ici sont ceux des structures (DRENA, écoles, classes).
 */

const DAY = 24 * 60 * 60 * 1000;
const list = (values: readonly string[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
const CATEGORIES = list(PILOT_CYCLES);

interface Window {
  /** Début de la période. */
  from: string;
  /** Début de la période d'avant (égal à `from` quand il n'y a pas de comparaison). */
  prevFrom: string;
  compare: boolean;
}

export function periodWindow(period: PilotPeriod, now = new Date()): Window {
  if (period === 'annee') {
    // L'année scolaire commence le 1er septembre.
    const year = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const from = new Date(Date.UTC(year, 8, 1)).toISOString();
    return { from, prevFrom: from, compare: false };
  }
  const days = Number(period);
  return {
    from: new Date(now.getTime() - days * DAY).toISOString(),
    prevFrom: new Date(now.getTime() - 2 * days * DAY).toISOString(),
    compare: true,
  };
}

/**
 * Apprenants d'un regroupement de structures (`rowmap` : row_id, org_id) et leurs actions :
 * inscriptions, leçons, quiz, envois de l'appareil et devoirs rendus.
 */
function learnerCtes(rowmap: SQL): SQL {
  return sql`
    rm as ${rowmap},
    lr as (
      select rm.row_id, m.user_id from rm
        join memberships m on m.organization_id = rm.org_id and m.role = 'apprenant'
         and (m.valid_until is null or m.valid_until > now())
      union
      select rm.row_id, cm.user_id from rm
        join cohorts c on c.organization_id = rm.org_id and c.archived_at is null
        join cohort_members cm on cm.cohort_id = c.id and cm.role = 'apprenant'
    ),
    users_in as (select distinct user_id from lr),
    act as (
      select user_id, enrolled_at as at from enrollments
       where user_id in (select user_id from users_in)
      union all
      select e.user_id, lp.completed_at from lesson_progress lp
        join enrollments e on e.id = lp.enrollment_id
       where e.user_id in (select user_id from users_in)
      union all
      select user_id, submitted_at from quiz_attempts where user_id in (select user_id from users_in)
      union all
      select user_id, created_at from learning_events where user_id in (select user_id from users_in)
      union all
      select learner_user_id, submitted_at from assignment_submissions
       where learner_user_id in (select user_id from users_in)
    ),
    enc as (
      select x.user_id, x.enrolled_at, x.total, x.done,
             case when x.total > 0 and x.done >= x.total then x.last_at end as completed_at
        from (
          select e.user_id, e.enrolled_at,
                 (select count(*) from lessons l
                    join course_versions v on v.id = l.course_version_id
                   where v.course_id = e.course_id and v.status = 'published')::int as total,
                 count(distinct lp.lesson_number)::int as done,
                 max(lp.completed_at) as last_at
            from enrollments e
            left join lesson_progress lp on lp.enrollment_id = e.id
           where e.user_id in (select user_id from users_in)
           group by e.id
        ) x
    )`;
}

interface RowMetrics extends Record<string, unknown> {
  row_id: string;
  establishments: number;
  learners: number;
  active_cur: number;
  active_prev: number;
  enrolled_now: number;
  completed_now: number;
  people_now: number;
  enrolled_prev: number;
  completed_prev: number;
  people_prev: number;
  asg_exp_cur: number;
  asg_on_cur: number;
  asg_people_cur: number;
  asg_exp_prev: number;
  asg_on_prev: number;
  asg_people_prev: number;
  quiz_score_cur: number;
  quiz_total_cur: number;
  quiz_people_cur: number;
  quiz_score_prev: number;
  quiz_total_prev: number;
  quiz_people_prev: number;
}

/** Chiffres de chaque regroupement, sur la période et la période d'avant. */
async function metrics(db: Executor, rowmap: SQL, w: Window): Promise<Map<string, RowMetrics>> {
  const F = sql`${w.from}::timestamptz`;
  const P = sql`${w.prevFrom}::timestamptz`;
  const { rows } = await db.execute<RowMetrics>(sql`
    with ${learnerCtes(rowmap)},
    ua as (
      select user_id, bool_or(at >= ${F}) as cur, bool_or(at >= ${P} and at < ${F}) as prev
        from act group by user_id
    ),
    asg as (
      select rm.row_id, a.due_at, cm.user_id,
             exists (select 1 from assignment_submissions s
                      where s.assignment_id = a.id and s.learner_user_id = cm.user_id
                        and s.submitted_at <= a.due_at) as on_time
        from rm
        join cohorts c on c.organization_id = rm.org_id
        join assignments a on a.cohort_id = c.id and a.due_at is not null
         and a.due_at < now() and a.due_at >= ${P}
        join cohort_members cm on cm.cohort_id = c.id and cm.role = 'apprenant'
    ),
    qz as (
      select user_id, submitted_at, score, total from quiz_attempts
       where user_id in (select user_id from users_in) and submitted_at >= ${P}
    )
    select r.row_id,
      (select count(*) from rm x join organizations o on o.id = x.org_id
        where x.row_id = r.row_id and o.type in (${CATEGORIES}) and o.archived_at is null)::int
        as establishments,
      (select count(*) from lr where lr.row_id = r.row_id)::int as learners,
      (select count(*) from lr join ua on ua.user_id = lr.user_id
        where lr.row_id = r.row_id and ua.cur)::int as active_cur,
      (select count(*) from lr join ua on ua.user_id = lr.user_id
        where lr.row_id = r.row_id and ua.prev)::int as active_prev,
      (select count(*) from enc join lr on lr.user_id = enc.user_id and lr.row_id = r.row_id)::int
        as enrolled_now,
      (select count(*) from enc join lr on lr.user_id = enc.user_id and lr.row_id = r.row_id
        where enc.completed_at is not null)::int as completed_now,
      (select count(distinct enc.user_id) from enc
        join lr on lr.user_id = enc.user_id and lr.row_id = r.row_id)::int as people_now,
      (select count(*) from enc join lr on lr.user_id = enc.user_id and lr.row_id = r.row_id
        where enc.enrolled_at < ${F})::int as enrolled_prev,
      (select count(*) from enc join lr on lr.user_id = enc.user_id and lr.row_id = r.row_id
        where enc.completed_at < ${F})::int as completed_prev,
      (select count(distinct enc.user_id) from enc
        join lr on lr.user_id = enc.user_id and lr.row_id = r.row_id
        where enc.enrolled_at < ${F})::int as people_prev,
      (select count(*) from asg where asg.row_id = r.row_id and asg.due_at >= ${F})::int
        as asg_exp_cur,
      (select count(*) from asg where asg.row_id = r.row_id and asg.due_at >= ${F}
        and asg.on_time)::int as asg_on_cur,
      (select count(distinct user_id) from asg where asg.row_id = r.row_id
        and asg.due_at >= ${F})::int as asg_people_cur,
      (select count(*) from asg where asg.row_id = r.row_id and asg.due_at < ${F})::int
        as asg_exp_prev,
      (select count(*) from asg where asg.row_id = r.row_id and asg.due_at < ${F}
        and asg.on_time)::int as asg_on_prev,
      (select count(distinct user_id) from asg where asg.row_id = r.row_id
        and asg.due_at < ${F})::int as asg_people_prev,
      (select coalesce(sum(qz.score), 0) from qz join lr on lr.user_id = qz.user_id
        and lr.row_id = r.row_id where qz.submitted_at >= ${F})::int as quiz_score_cur,
      (select coalesce(sum(qz.total), 0) from qz join lr on lr.user_id = qz.user_id
        and lr.row_id = r.row_id where qz.submitted_at >= ${F})::int as quiz_total_cur,
      (select count(distinct qz.user_id) from qz join lr on lr.user_id = qz.user_id
        and lr.row_id = r.row_id where qz.submitted_at >= ${F})::int as quiz_people_cur,
      (select coalesce(sum(qz.score), 0) from qz join lr on lr.user_id = qz.user_id
        and lr.row_id = r.row_id where qz.submitted_at < ${F})::int as quiz_score_prev,
      (select coalesce(sum(qz.total), 0) from qz join lr on lr.user_id = qz.user_id
        and lr.row_id = r.row_id where qz.submitted_at < ${F})::int as quiz_total_prev,
      (select count(distinct qz.user_id) from qz join lr on lr.user_id = qz.user_id
        and lr.row_id = r.row_id where qz.submitted_at < ${F})::int as quiz_people_prev
    from (select distinct row_id from rm) r`);
  return new Map(rows.map((r) => [r.row_id, r]));
}

const activeRate = (m: RowMetrics) => percent(m.active_cur, m.learners, m.learners);
const previousActiveRate = (m: RowMetrics) => percent(m.active_prev, m.learners, m.learners);
const completionRate = (m: RowMetrics) => percent(m.completed_now, m.enrolled_now, m.people_now);
const assignmentsRate = (m: RowMetrics) => percent(m.asg_on_cur, m.asg_exp_cur, m.asg_people_cur);
const previousAssignmentsRate = (m: RowMetrics) =>
  percent(m.asg_on_prev, m.asg_exp_prev, m.asg_people_prev);

/** Les structures d'une liste, et ce qui en dépend, chacune comptée dans sa propre ligne. */
function subtreeRowmap(ids: string[], scope: SQL): SQL {
  return sql`(
    with recursive t(row_id, org_id) as (
      select o.id::text, o.id from organizations o where o.id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      union
      select t.row_id, c.id from organizations c join t on c.parent_id = t.org_id
    )
    select row_id, org_id from t where org_id in ${scope})`;
}

interface OrgRow extends Record<string, unknown> {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
}

export async function pilotOverview(
  db: Executor,
  userId: string,
  options: { zone?: string; cycle?: PilotCycle; period: PilotPeriod },
  now = new Date(),
): Promise<PilotOverview> {
  const SC = statsOrganizationIds(userId);
  const w = periodWindow(options.period, now);

  // Toutes les structures de la personne (hors structure technique et archives).
  const { rows: all } = await db.execute<OrgRow>(sql`
    select o.id, o.name, o.type, o.parent_id from organizations o
     where o.id in ${SC} and not o.internal and o.archived_at is null
     order by o.name`);
  const byId = new Map(all.map((o) => [o.id, o]));
  const isService = (o: OrgRow) =>
    ['ministry', 'central_direction', 'apfc', 'iepp', 'partner'].includes(o.type);
  const children = (id: string) => all.filter((o) => o.parent_id === id && !isService(o));
  const [nat] = (
    await db.execute<{ national: boolean }>(sql`
      select exists (
        select 1 from memberships m join organizations o on o.id = m.organization_id
         where m.user_id = ${userId} and (m.valid_until is null or m.valid_until > now())
           and (m.role in ('superadministrateur', 'administrateur', 'cabinet', 'direction-centrale')
                or (m.role = 'partenaire' and o.parent_id is null))) as national`)
  ).rows;
  const national = nat?.national ?? false;

  // Zone affichée et sous-zones.
  let zoneId: string | null = options.zone ?? null;
  if (zoneId && !byId.has(zoneId)) throw new TeamError('not_found', 'Zone introuvable.');
  let rowOrgs: OrgRow[];
  if (zoneId) {
    rowOrgs = children(zoneId);
  } else {
    const roots = all.filter(
      (o) => !isService(o) && (o.parent_id === null || !byId.has(o.parent_id)),
    );
    if (roots.length === 1 && !national) {
      zoneId = roots[0]!.id;
      rowOrgs = children(zoneId);
    } else {
      rowOrgs = roots;
    }
  }
  const path: Array<{ id: string | null; name: string }> = [];
  for (let id = zoneId; id && byId.has(id); id = byId.get(id)!.parent_id) {
    path.unshift({ id, name: byId.get(id)!.name });
  }
  if (national) path.unshift({ id: null, name: 'Tout le pays' });
  const zoneName = path.at(-1)?.name ?? 'Votre zone';

  const S0 = zoneId
    ? sql`(
        with recursive z(id) as (
          select ${zoneId}::uuid
          union
          select o.id from organizations o join z on o.parent_id = z.id
        )
        select id from z where id in ${SC})`
    : SC;
  const S = options.cycle
    ? sql`(select id from organizations where id in ${S0} and type = ${options.cycle})`
    : S0;
  const zoneMap = sql`(select 'zone'::text as row_id, id as org_id from organizations where id in ${S})`;

  const zone = (await metrics(db, zoneMap, w)).get('zone');
  const prev = <T>(value: T) => (w.compare ? value : null);

  // Taille de la zone.
  const [cov] = (
    await db.execute<{
      establishments: number;
      classes: number;
      teachers: number;
      courses: number;
    }>(
      sql`
      select
        (select count(*) from organizations where id in ${S} and type in (${CATEGORIES})
           and archived_at is null)::int as establishments,
        (select count(*) from cohorts where organization_id in ${S} and archived_at is null)::int
           as classes,
        (select count(distinct user_id) from memberships where organization_id in ${S}
           and role in ('enseignant', 'alphabetiseur')
           and (valid_until is null or valid_until > now()))::int as teachers,
        (select count(distinct c.id) from courses c
           join course_versions v on v.course_id = c.id and v.status = 'published'
          where c.organization_id in ${S0})::int as courses`,
    )
  ).rows;

  // Apprenants actifs semaine par semaine (12 semaines) et parcours.
  const { rows: weeks } = await db.execute<{ week: string; n: number }>(sql`
    with ${learnerCtes(zoneMap)}
    select to_char(date_trunc('week', at), 'YYYY-MM-DD') as week, count(distinct user_id)::int as n
      from act where at >= date_trunc('week', now()) - interval '11 weeks'
     group by 1`);
  const weekly: PilotOverview['weekly'] = [];
  const monday = new Date(now);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(monday.getTime() - i * 7 * DAY).toISOString().slice(0, 10);
    weekly.push({ week: d, active: mask(weeks.find((r) => r.week === d)?.n ?? 0) });
  }
  const [funnel] = (
    await db.execute<{ enrolled: number; started: number; halfway: number; completed: number }>(sql`
      with ${learnerCtes(zoneMap)}
      select count(distinct user_id)::int as enrolled,
             count(distinct user_id) filter (where done > 0)::int as started,
             count(distinct user_id) filter (where total > 0 and done * 2 >= total)::int as halfway,
             count(distinct user_id) filter (where completed_at is not null)::int as completed
        from enc`)
  ).rows;

  // Sous-zones, les plus fragiles d'abord.
  const rowMetrics = rowOrgs.length
    ? await metrics(
        db,
        subtreeRowmap(
          rowOrgs.map((o) => o.id),
          S,
        ),
        w,
      )
    : new Map<string, RowMetrics>();
  const rows: PilotZoneRow[] = rowOrgs
    .map((o) => {
      const m = rowMetrics.get(o.id);
      const active = m ? activeRate(m) : null;
      return {
        id: o.id,
        name: o.name,
        type: o.type,
        establishments: m?.establishments ?? 0,
        learners: m ? mask(m.learners) : 0,
        activeRate: active,
        previousActiveRate: m && w.compare ? previousActiveRate(m) : null,
        completionRate: m ? completionRate(m) : null,
        assignmentsRate: m ? assignmentsRate(m) : null,
        previousAssignmentsRate: m && w.compare ? previousAssignmentsRate(m) : null,
        state: pilotState(active),
        opens: children(o.id).length > 0,
      };
    })
    .filter((r) => !options.cycle || r.establishments > 0)
    .sort(
      (a, b) =>
        (a.activeRate ?? 1000) - (b.activeRate ?? 1000) || a.name.localeCompare(b.name, 'fr'),
    );

  // Par cycle (dans la zone, tous cycles confondus).
  const cycleMetrics = await metrics(
    db,
    sql`(select o.type::text as row_id, o.id as org_id from organizations o
          where o.id in ${S0} and o.type in (${CATEGORIES}))`,
    w,
  );
  const cycles = PILOT_CYCLES.filter((c) => cycleMetrics.has(c))
    .map((c) => {
      const m = cycleMetrics.get(c)!;
      return { cycle: c, learners: mask(m.learners), completionRate: completionRate(m) };
    })
    .sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1));

  const alerts = await pilotAlerts(db, S, rows, cycles, zone ? completionRate(zone) : null);

  return {
    threshold: STATS_THRESHOLD,
    generatedAt: now.toISOString(),
    period: options.period,
    cycle: options.cycle ?? null,
    zone: { id: zoneId, name: zoneName, path },
    zoneOptions: all
      .filter((o) => o.type === 'authority')
      .map((o) => ({ id: o.id, name: o.name, type: o.type })),
    kpis: {
      active: {
        value: zone ? mask(zone.active_cur) : 0,
        previous: prev(zone ? mask(zone.active_prev) : 0),
      },
      completionRate: {
        value: zone ? completionRate(zone) : null,
        previous: prev(
          zone ? percent(zone.completed_prev, zone.enrolled_prev, zone.people_prev) : null,
        ),
      },
      assignmentsRate: {
        value: zone ? assignmentsRate(zone) : null,
        previous: prev(zone ? previousAssignmentsRate(zone) : null),
      },
      quizSuccess: {
        value: zone
          ? percent(zone.quiz_score_cur, zone.quiz_total_cur, zone.quiz_people_cur)
          : null,
        previous: prev(
          zone ? percent(zone.quiz_score_prev, zone.quiz_total_prev, zone.quiz_people_prev) : null,
        ),
      },
    },
    coverage: {
      establishments: cov!.establishments,
      classes: cov!.classes,
      teachers: cov!.teachers,
      learners: zone ? mask(zone.learners) : 0,
      publishedCourses: cov!.courses,
    },
    weekly,
    funnel: {
      enrolled: mask(funnel!.enrolled),
      started: mask(funnel!.started),
      halfway: mask(funnel!.halfway),
      completed: mask(funnel!.completed),
    },
    rows,
    averageActiveRate: zone ? activeRate(zone) : null,
    cycles,
    alerts,
  };
}

/** Points d'attention : ce qui demande une action, du plus urgent au moins urgent. */
async function pilotAlerts(
  db: Executor,
  S: SQL,
  rows: PilotZoneRow[],
  cycles: PilotOverview['cycles'],
  averageCompletion: number | null,
): Promise<PilotAlert[]> {
  const alerts: PilotAlert[] = [];
  const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

  // Établissements dont les apprenants n'ont rien fait depuis 14 jours.
  const schoolMap = sql`(select o.id::text as row_id, o.id as org_id from organizations o
      where o.id in ${S} and o.type in (${CATEGORIES}) and o.archived_at is null)`;
  const { rows: idle } = await db.execute<{ name: string; parent: string | null }>(sql`
    with ${learnerCtes(schoolMap)},
    last as (
      select lr.row_id, max(a.at) as last_at from lr left join act a on a.user_id = lr.user_id
       group by lr.row_id
    )
    select o.name, p.name as parent from last
      join organizations o on o.id::text = last.row_id
      left join organizations p on p.id = o.parent_id
     where last.last_at is null or last.last_at < now() - interval '14 days'
     order by o.name`);
  if (idle.length > 0) {
    const counts = new Map<string, number>();
    for (const r of idle) if (r.parent) counts.set(r.parent, (counts.get(r.parent) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    alerts.push({
      level: 'alert',
      title: `${idle.length} ${plural(idle.length, 'établissement', 'établissements')} sans aucune activité depuis 14 jours`,
      detail:
        top && counts.size > 1
          ? `Dont ${top[1]} dans ${top[0]}.`
          : 'Aucune leçon, aucun quiz ni aucun devoir ouvert par leurs apprenants.',
      items: idle.slice(0, 12).map((r) => r.name),
    });
  }

  // Classes sans enseignant.
  const { rows: alone } = await db.execute<{ name: string; school: string }>(sql`
    select c.name, o.name as school from cohorts c join organizations o on o.id = c.organization_id
     where c.organization_id in ${S} and c.archived_at is null
       and not exists (select 1 from cohort_members cm
                        where cm.cohort_id = c.id and cm.role = 'enseignant')
     order by o.name, c.name`);
  if (alone.length > 0) {
    alerts.push({
      level: 'alert',
      title: `${alone.length} ${plural(alone.length, 'classe', 'classes')} sans enseignant`,
      detail: 'Les élèves ne reçoivent ni devoirs ni évaluations.',
      items: alone.slice(0, 12).map((r) => `${r.name} (${r.school})`),
    });
  }

  // Devoirs rendus en baisse d'au moins 10 points.
  for (const r of rows) {
    if (r.assignmentsRate === null || r.previousAssignmentsRate === null) continue;
    if (r.previousAssignmentsRate - r.assignmentsRate >= 10) {
      alerts.push({
        level: 'watch',
        title: `Devoirs rendus en baisse : ${r.name}`,
        detail: `${r.assignmentsRate} % sur la période, contre ${r.previousAssignmentsRate} % la période d’avant.`,
        items: [],
      });
    }
  }

  // Le cycle le plus bas, s'il est nettement sous la moyenne.
  const known = cycles.filter((c) => c.completionRate !== null);
  const lowest = known.at(-1);
  if (known.length >= 2 && lowest && averageCompletion !== null) {
    if (lowest.completionRate! <= averageCompletion - 10) {
      alerts.push({
        level: 'watch',
        title: `${PILOT_CYCLE_LABELS[lowest.cycle]} : seulement ${lowest.completionRate} % de cours terminés`,
        detail: `Le cycle le plus bas ; la moyenne de la zone est de ${averageCompletion} %.`,
        items: [],
      });
    }
  }

  // La plus forte hausse d'apprenants actifs.
  const rises = rows
    .filter((r) => r.activeRate !== null && r.previousActiveRate !== null)
    .map((r) => ({ r, gain: r.activeRate! - r.previousActiveRate! }))
    .sort((a, b) => b.gain - a.gain);
  if (rises[0] && rises[0].gain >= 10) {
    alerts.push({
      level: 'ok',
      title: `${rises[0].r.name} : +${rises[0].gain} points d’apprenants actifs`,
      detail: 'La plus forte hausse de la période.',
      items: [],
    });
  }
  return alerts;
}
