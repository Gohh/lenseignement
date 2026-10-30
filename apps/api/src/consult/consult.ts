import {
  CONSULT_LIMIT,
  type ConsultAssignment,
  type ConsultClass,
  type ConsultCourse,
  type ConsultEvaluation,
  type ConsultQuery,
  type ConsultView,
} from '@lenseignement/types';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { TeamError, teamPowers } from '../team/team.js';

/**
 * Écran « Consulter » : le superadministrateur et l'administrateur voient les cours, les
 * classes, les devoirs et les évaluations de toute la plateforme, sans rien pouvoir modifier.
 */
async function assertConsult(db: Database, userId: string): Promise<void> {
  const powers = await teamPowers(db, userId);
  if (!powers.everywhere) {
    throw new TeamError('forbidden', 'Réservé au superadministrateur et aux administrateurs.');
  }
}

const like = (search?: string) => (search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null);

async function courses(db: Database, pattern: string | null): Promise<ConsultCourse[]> {
  const { rows } = await db.execute<ConsultCourse>(sql`
    select c.id, v.title, v.status, o.name as establishment, u.display_name as author,
           to_char(v.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
      from courses c
      join lateral (select * from course_versions cv where cv.course_id = c.id
                     order by cv.number desc limit 1) v on true
      join organizations o on o.id = c.organization_id
      left join users u on u.id = c.created_by
     where ${pattern}::text is null or v.title ilike ${pattern} or o.name ilike ${pattern}
     order by v.updated_at desc
     limit ${CONSULT_LIMIT}`);
  return rows;
}

async function classes(db: Database, pattern: string | null): Promise<ConsultClass[]> {
  const { rows } = await db.execute<ConsultClass>(sql`
    select k.id, k.name, k.level, k.school_year as "schoolYear", o.name as establishment,
           coalesce(array_agg(distinct coalesce(t.display_name, 'Sans nom'))
                      filter (where m.role = 'enseignant'), '{}') as teachers,
           (count(distinct m.user_id) filter (where m.role = 'apprenant'))::int as learners,
           k.archived_at is not null as archived
      from cohorts k
      join organizations o on o.id = k.organization_id
      left join cohort_members m on m.cohort_id = k.id
      left join users t on t.id = m.user_id and m.role = 'enseignant'
     where ${pattern}::text is null or k.name ilike ${pattern} or o.name ilike ${pattern}
     group by k.id, o.name
     order by k.archived_at nulls first, k.created_at desc
     limit ${CONSULT_LIMIT}`);
  return rows;
}

async function assignments(db: Database, pattern: string | null): Promise<ConsultAssignment[]> {
  const { rows } = await db.execute<ConsultAssignment>(sql`
    select a.id, a.title, k.name as "className", o.name as establishment,
           u.display_name as author,
           to_char(a.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "dueAt",
           (select count(*)::int from assignment_submissions s where s.assignment_id = a.id)
             as submitted,
           (select count(*)::int from assignment_submissions s
             where s.assignment_id = a.id and s.score is not null) as graded
      from assignments a
      join cohorts k on k.id = a.cohort_id
      join organizations o on o.id = k.organization_id
      left join users u on u.id = a.created_by_user_id
     where ${pattern}::text is null or a.title ilike ${pattern} or k.name ilike ${pattern}
           or o.name ilike ${pattern}
     order by a.created_at desc
     limit ${CONSULT_LIMIT}`);
  return rows;
}

async function evaluations(db: Database, pattern: string | null): Promise<ConsultEvaluation[]> {
  const { rows } = await db.execute<ConsultEvaluation>(sql`
    select e.id, e.title, e.subject, k.name as "className", o.name as establishment,
           e.held_on::text as "heldOn", e.max_score as "maxScore",
           count(s.id)::int as scored,
           round(avg(s.score)::numeric, 2)::float8 as average
      from evaluations e
      join cohorts k on k.id = e.cohort_id
      join organizations o on o.id = k.organization_id
      left join evaluation_scores s on s.evaluation_id = e.id
     where ${pattern}::text is null or e.title ilike ${pattern} or k.name ilike ${pattern}
           or o.name ilike ${pattern}
     group by e.id, k.name, o.name
     order by e.held_on desc, e.created_at desc
     limit ${CONSULT_LIMIT}`);
  return rows;
}

const readers = { cours: courses, classes, devoirs: assignments, evaluations };

export async function consult(
  db: Database,
  userId: string,
  view: ConsultView,
  query: ConsultQuery,
): Promise<{ items: unknown[] }> {
  await assertConsult(db, userId);
  return { items: await readers[view](db, like(query.search)) };
}
