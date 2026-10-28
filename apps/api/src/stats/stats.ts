import { STATS_THRESHOLD, type MaskedCount, type StatsOverview } from '@lenseignement/types';
import { sql } from 'drizzle-orm';
import { organizationIdsWithRoles, STATS_ROLES } from '../access/access.service.js';
import type { Executor } from '../db/database.js';

/**
 * Tableau de chiffres anonymes (ADR-016). Seulement des effectifs agrégés, calculés sur les
 * structures de la personne (sous-structures comprises) ; un effectif de 1 à 4 personnes est
 * masqué, et un pourcentage n'est donné que sur 5 personnes ou plus. Aucun nom ni identifiant
 * de personne ne sort d'ici.
 */

/** Effectif masqué entre 1 et 4. */
export function mask(n: number): MaskedCount {
  return n > 0 && n < STATS_THRESHOLD ? null : n;
}

/** Pourcentage entier, seulement si la base compte au moins 5 personnes. */
export function percent(part: number, whole: number, people: number): number | null {
  return people >= STATS_THRESHOLD && whole > 0 ? Math.round((100 * part) / whole) : null;
}

interface CourseRow extends Record<string, unknown> {
  course_id: string;
  title: string;
  branch: string;
  enrolled: number;
  started: number;
  completed: number;
  active7: number;
  active30: number;
  quiz_people: number;
  quiz_score: number;
  quiz_total: number;
}

export async function statsOverview(db: Executor, userId: string): Promise<StatsOverview> {
  const scope = organizationIdsWithRoles(userId, STATS_ROLES);

  const orgs = await db.execute<{ name: string }>(
    sql`select name from organizations where id in ${scope} order by name`,
  );

  // Cours publiés des structures couvertes ; l'activité compte l'inscription, les leçons
  // terminées, les quiz et les actions envoyées par l'appareil.
  const courses = await db.execute<CourseRow>(sql`
    with pub as (
      select c.id as course_id, v.title, c.branch,
             (select count(*) from lessons l where l.course_version_id = v.id)::int as total
        from courses c
        join course_versions v on v.course_id = c.id and v.status = 'published'
       where c.organization_id in ${scope}
    ),
    done as (
      select e.course_id, e.user_id, count(lp.id)::int as n
        from enrollments e
        left join lesson_progress lp on lp.enrollment_id = e.id
       where e.course_id in (select course_id from pub)
       group by e.course_id, e.user_id
    ),
    activity as (
      select course_id, user_id, enrolled_at as at from enrollments
      union all
      select e.course_id, e.user_id, lp.completed_at
        from lesson_progress lp join enrollments e on e.id = lp.enrollment_id
      union all
      select course_id, user_id, submitted_at from quiz_attempts
      union all
      select course_id, user_id, created_at from learning_events
    )
    select p.course_id, p.title, p.branch,
           (select count(*) from done d where d.course_id = p.course_id)::int as enrolled,
           (select count(*) from done d where d.course_id = p.course_id and d.n > 0)::int as started,
           (select count(*) from done d
             where d.course_id = p.course_id and p.total > 0 and d.n >= p.total)::int as completed,
           (select count(distinct a.user_id) from activity a
             where a.course_id = p.course_id and a.at > now() - interval '7 days')::int as active7,
           (select count(distinct a.user_id) from activity a
             where a.course_id = p.course_id and a.at > now() - interval '30 days')::int as active30,
           (select count(distinct q.user_id) from quiz_attempts q
             where q.course_id = p.course_id)::int as quiz_people,
           (select coalesce(sum(q.score), 0) from quiz_attempts q
             where q.course_id = p.course_id)::int as quiz_score,
           (select coalesce(sum(q.total), 0) from quiz_attempts q
             where q.course_id = p.course_id)::int as quiz_total
      from pub p
     order by p.title`);

  // Apprenants rattachés (rôle « apprenant ») aux structures couvertes.
  const learners = sql`(
    select m.user_id from memberships m
     where m.role = 'apprenant'
       and (m.valid_until is null or m.valid_until > now())
       and m.organization_id in ${scope})`;
  const [counts] = (
    await db.execute<{
      diagnosed: number;
      in_progress: number;
      completed: number;
      oriented: number;
      tried: number;
      passed: number;
      requested: number;
    }>(sql`
    select
      (select count(distinct s.user_id) from diagnostic_sessions s
        where s.phase = 'diagnostic' and s.user_id in ${learners})::int as diagnosed,
      (select count(distinct p.user_id) from remediation_plans p
        where p.status = 'active' and p.user_id in ${learners})::int as in_progress,
      (select count(distinct p.user_id) from remediation_plans p
        where p.status = 'completed' and p.user_id in ${learners})::int as completed,
      (select count(distinct p.user_id) from remediation_plans p
        where p.user_id in ${learners})::int as oriented,
      (select count(distinct a.user_id) from simulation_attempts a
        where a.user_id in ${learners})::int as tried,
      (select count(distinct a.user_id) from simulation_attempts a
        where a.passed and a.user_id in ${learners})::int as passed,
      (select count(distinct r.user_id) from practice_requests r
        where r.user_id in ${learners})::int as requested`)
  ).rows;

  return {
    threshold: STATS_THRESHOLD,
    generatedAt: new Date().toISOString(),
    organizations: orgs.rows.map((o) => o.name),
    courses: courses.rows.map((c) => ({
      courseId: c.course_id,
      title: c.title,
      branch: c.branch,
      enrolled: mask(c.enrolled),
      started: mask(c.started),
      completed: mask(c.completed),
      active7: mask(c.active7),
      active30: mask(c.active30),
      quizSuccess: percent(c.quiz_score, c.quiz_total, c.quiz_people),
    })),
    remediation: {
      diagnosed: mask(counts!.diagnosed),
      inProgress: mask(counts!.in_progress),
      completed: mask(counts!.completed),
      effectiveRate: percent(counts!.completed, counts!.oriented, counts!.oriented),
    },
    workshop: {
      tried: mask(counts!.tried),
      passed: mask(counts!.passed),
      requested: mask(counts!.requested),
    },
  };
}
