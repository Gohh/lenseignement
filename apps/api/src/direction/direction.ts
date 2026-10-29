import {
  INACTIVE_DAYS,
  levelLabel,
  LOW_AVERAGE,
  MISSING_ASSIGNMENTS,
  type DirectionClass,
  type DirectionOverview,
  type LearnerToFollow,
} from '@lenseignement/types';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { cohortMembers, cohorts, users } from '../db/schema.js';
import { TeamError } from '../team/team.js';

const DAY = 24 * 60 * 60 * 1000;

interface LearnerRow {
  cohort_id: string;
  user_id: string;
  name: string | null;
  joined_at: string | Date;
  last_activity: string | Date | null;
  average: number | string | null;
  due: number;
  missing: number;
}

const oneDecimal = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Raisons de suivre un élève ; liste vide si tout va bien. */
export function followReasons(
  learner: { lastActivity: Date | null; joinedAt: Date; average: number | null; missing: number },
  now: Date,
): string[] {
  const reasons: string[] = [];
  const since = learner.lastActivity ?? learner.joinedAt;
  const days = Math.floor((now.getTime() - since.getTime()) / DAY);
  if (days >= INACTIVE_DAYS) {
    reasons.push(
      learner.lastActivity
        ? `Pas d’activité depuis ${days} jours`
        : `Aucune activité depuis son arrivée (${days} jours)`,
    );
  }
  if (learner.average !== null && learner.average < LOW_AVERAGE) {
    reasons.push(`Moyenne ${oneDecimal(learner.average)}/20`);
  }
  if (learner.missing >= MISSING_ASSIGNMENTS) {
    reasons.push(`${learner.missing} devoirs non rendus`);
  }
  return reasons;
}

/**
 * Vue d'ensemble d'un établissement pour une année scolaire. Sans établissement demandé : le
 * premier que la personne dirige, sinon le premier qu'elle gère.
 */
export async function directionOverview(
  db: Database,
  userId: string,
  options: { organizationId?: string; schoolYear?: string },
  now = new Date(),
): Promise<DirectionOverview> {
  const { rows: orgRows } = await db.execute(sql`
    select o.id, o.name,
           exists (select 1 from memberships m where m.user_id = ${userId}
                     and m.organization_id = o.id and m.role = 'chef-etablissement'
                     and (m.valid_until is null or m.valid_until > now())) as directs
      from organizations o
     where o.id in ${teamOrganizationIds(userId)}
       and o.type <> 'authority' and o.archived_at is null
     order by directs desc, o.name
     limit 500`);
  const organizations = (orgRows as Array<{ id: string; name: string; directs: boolean }>).map(
    ({ id, name }) => ({ id, name }),
  );
  const empty: DirectionOverview = {
    organizations: organizations.sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    organization: null,
    schoolYears: [],
    schoolYear: null,
    totals: { classes: 0, learners: 0, teachers: 0, activeLast7Days: 0, toFollow: 0 },
    classes: [],
    toFollow: [],
  };
  if (orgRows.length === 0) {
    throw new TeamError(
      'forbidden',
      'Réservé à la direction et à ceux qui gèrent un établissement.',
    );
  }
  const chosen = options.organizationId
    ? (orgRows as Array<{ id: string; name: string }>).find((o) => o.id === options.organizationId)
    : (orgRows[0] as { id: string; name: string });
  if (!chosen) throw new TeamError('not_found', 'Établissement introuvable.');
  const organization = { id: chosen.id, name: chosen.name };

  const years = await db
    .selectDistinct({ schoolYear: cohorts.schoolYear })
    .from(cohorts)
    .where(and(eq(cohorts.organizationId, organization.id), isNull(cohorts.archivedAt)));
  const schoolYears = years.map((y) => y.schoolYear).sort((a, b) => b.localeCompare(a));
  const schoolYear =
    options.schoolYear && schoolYears.includes(options.schoolYear)
      ? options.schoolYear
      : (schoolYears[0] ?? null);
  if (!schoolYear) return { ...empty, organization, schoolYears };

  const classRows = await db
    .select({ id: cohorts.id, name: cohorts.name, level: cohorts.level })
    .from(cohorts)
    .where(
      and(
        eq(cohorts.organizationId, organization.id),
        eq(cohorts.schoolYear, schoolYear),
        isNull(cohorts.archivedAt),
      ),
    )
    .orderBy(asc(cohorts.name));
  const ids = classRows.map((c) => c.id);
  if (ids.length === 0) return { ...empty, organization, schoolYears, schoolYear };
  const idList = sql`${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}`;

  const teacherRows = await db
    .select({ cohortId: cohortMembers.cohortId, userId: users.id, name: users.displayName })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(and(sql`${cohortMembers.cohortId} in (${idList})`, eq(cohortMembers.role, 'enseignant')))
    .orderBy(asc(users.displayName));

  const { rows: assignmentRows } = await db.execute(sql`
    select cohort_id, count(*)::int as n from assignments
     where cohort_id in (${idList}) group by cohort_id`);
  const assignmentCount = new Map(
    (assignmentRows as Array<{ cohort_id: string; n: number }>).map((r) => [r.cohort_id, r.n]),
  );

  const { rows } = await db.execute(sql`
    select cm.cohort_id, u.id as user_id, u.display_name as name, cm.created_at as joined_at,
           greatest(
             (select max(le.created_at) from learning_events le where le.user_id = u.id),
             (select max(s.submitted_at) from assignment_submissions s
                join assignments a on a.id = s.assignment_id
               where s.learner_user_id = u.id and a.cohort_id = cm.cohort_id)
           ) as last_activity,
           (select sum(es.score / e.max_score * 20 * e.coefficient) / nullif(sum(e.coefficient), 0)
              from evaluation_scores es join evaluations e on e.id = es.evaluation_id
             where es.learner_user_id = u.id and e.cohort_id = cm.cohort_id) as average,
           (select count(*)::int from assignments a
             where a.cohort_id = cm.cohort_id and a.due_at < now() and a.due_at > cm.created_at) as due,
           (select count(*)::int from assignments a
             where a.cohort_id = cm.cohort_id and a.due_at < now() and a.due_at > cm.created_at
               and not exists (select 1 from assignment_submissions s
                                where s.assignment_id = a.id and s.learner_user_id = u.id)) as missing
      from cohort_members cm
      join users u on u.id = cm.user_id
     where cm.role = 'apprenant' and cm.cohort_id in (${idList})
     order by u.display_name`);

  const learners = (rows as unknown as LearnerRow[]).map((r) => {
    const lastActivity = r.last_activity ? new Date(r.last_activity) : null;
    const average = r.average === null ? null : Number(r.average);
    const reasons = followReasons(
      { lastActivity, joinedAt: new Date(r.joined_at), average, missing: r.missing },
      now,
    );
    return { ...r, lastActivity, average, reasons };
  });
  const weekAgo = now.getTime() - 7 * DAY;
  const active = (l: (typeof learners)[number]) =>
    l.lastActivity !== null && l.lastActivity.getTime() >= weekAgo;

  const classes: DirectionClass[] = classRows.map((c) => {
    const mine = learners.filter((l) => l.cohort_id === c.id);
    const due = mine.reduce((n, l) => n + l.due, 0);
    const missing = mine.reduce((n, l) => n + l.missing, 0);
    const averages = mine.map((l) => l.average).filter((a): a is number => a !== null);
    return {
      id: c.id,
      name: c.name,
      levelLabel: c.level ? levelLabel(c.level) : null,
      teachers: teacherRows.filter((t) => t.cohortId === c.id).map((t) => t.name ?? 'Sans nom'),
      learnerCount: mine.length,
      activeLast7Days: mine.filter(active).length,
      assignmentCount: assignmentCount.get(c.id) ?? 0,
      submissionRate: due === 0 ? null : Math.round(((due - missing) / due) * 100),
      average:
        averages.length === 0
          ? null
          : Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10,
      toFollow: mine.filter((l) => l.reasons.length > 0).length,
    };
  });
  const className = new Map(classRows.map((c) => [c.id, c.name]));
  const toFollow: LearnerToFollow[] = learners
    .filter((l) => l.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, 100)
    .map((l) => ({
      userId: l.user_id,
      name: l.name ?? 'Sans nom',
      cohortId: l.cohort_id,
      cohortName: className.get(l.cohort_id) ?? '',
      reasons: l.reasons,
    }));

  return {
    ...empty,
    organization,
    schoolYears,
    schoolYear,
    totals: {
      classes: classes.length,
      learners: new Set(learners.map((l) => l.user_id)).size,
      teachers: new Set(teacherRows.map((t) => t.userId)).size,
      activeLast7Days: new Set(learners.filter(active).map((l) => l.user_id)).size,
      toFollow: new Set(learners.filter((l) => l.reasons.length > 0).map((l) => l.user_id)).size,
    },
    classes,
    toFollow,
  };
}
