import {
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_DOMAINS,
  EXERCISE_SKILL_LABELS,
  EXERCISE_SKILLS,
  STATS_THRESHOLD,
  type AssignmentExerciseResult,
  type CampaignResultRow,
  type CampaignResults,
  type CampaignSummary,
  type ExamRate,
} from '@lenseignement/types';
import { sql, type SQL } from 'drizzle-orm';
import { statsOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { ExerciseError } from '../exercises/exercises.js';
import { campaignReach, canPilot, loadCampaign, statusOf, summaries } from './campaigns.js';
import { examItemList } from './exams.js';

/**
 * Résultats des campagnes closes (étape 4c-2), lus dans le tableau de pilotage.
 * - Qui : celui qui pilote la campagne (toute la campagne), et toute personne qui a des
 *   statistiques sur une partie de la zone (cabinet, directions, DRENA, IEPP, partenaires,
 *   direction d'école…) : seulement les classes de ses structures.
 * - Aucun nom d'élève ; une moyenne n'est donnée que pour un groupe d'au moins 5 élèves.
 * - Rien avant la clôture : les notes sont encore cachées.
 */

const pct = (values: number[]) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) : 0;

/** Campagnes visibles dans les statistiques : pilotées, ou passées dans une de ses structures. */
export async function statsCampaigns(db: Database, userId: string): Promise<CampaignSummary[]> {
  const reach = await campaignReach(db, userId);
  const zoneIds = reach.zones.map((z) => z.id!);
  const pilot: SQL = reach.national
    ? sql`true`
    : zoneIds.length
      ? sql`(k.created_by = ${userId} or k.zone_id in ${zoneIds})`
      : sql`k.created_by = ${userId}`;
  return summaries(
    db,
    sql`(${pilot} or k.id in (
      select a.campaign_id from assignments a join cohorts c on c.id = a.cohort_id
       where a.campaign_id is not null and c.organization_id in ${statsOrganizationIds(userId)}))`,
  );
}

interface ClassRow extends Record<string, unknown> {
  assignment_id: string;
  school_id: string;
  school: string;
  drena: string | null;
  iepp: string | null;
  learners: number;
}

export async function campaignResults(
  db: Database,
  userId: string,
  id: string,
): Promise<CampaignResults> {
  const row = await loadCampaign(db, id);
  const pilot = canPilot(row, userId, await campaignReach(db, userId));
  const scope = pilot ? sql`true` : sql`c.organization_id in ${statsOrganizationIds(userId)}`;
  const { rows: classes } = await db.execute<ClassRow>(sql`
    select a.id as assignment_id, o.id as school_id, o.name as school, p.name as drena,
      nullif(trim(o.details->>'iepp'), '') as iepp,
      (select count(*)::int from cohort_members cm
        where cm.cohort_id = c.id and cm.role = 'apprenant') as learners
      from assignments a
      join cohorts c on c.id = a.cohort_id
      join organizations o on o.id = c.organization_id
      left join organizations p on p.id = o.parent_id
     where a.campaign_id = ${id} and ${scope}`);
  if (!pilot && classes.length === 0) throw new ExerciseError('not_found', 'Campagne introuvable.');
  const [summary] = await summaries(db, sql`k.id = ${id}`);
  if (statusOf(row) !== 'close') {
    throw new ExerciseError('invalid', 'Les résultats s’ouvrent à la clôture de la campagne.');
  }

  const items = await examItemList(db, row.examId);
  const threshold = summary!.exam.threshold;
  const { rows: subs } = classes.length
    ? await db.execute<{ assignment_id: string; results: AssignmentExerciseResult[] | null }>(sql`
        select s.assignment_id, s.results from assignment_submissions s
         where s.assignment_id in ${classes.map((c) => c.assignment_id)}`)
    : { rows: [] };

  // Une copie : le taux de chaque question (0 à 1).
  const byAssignment = new Map(classes.map((c) => [c.assignment_id, c]));
  const copies = subs.map((s) => {
    const scores = new Map((s.results ?? []).map((r) => [r.exerciseId, r.score]));
    const all = items.map((i) => scores.get(i.exerciseId) ?? 0);
    return { cls: byAssignment.get(s.assignment_id)!, scores, rate: pct(all) };
  });
  type Copy = (typeof copies)[number];
  const domainRates = (list: Copy[]) =>
    EXERCISE_DOMAINS.map((d) => {
      const its = items.filter((i) => i.domain === d);
      return {
        key: d,
        label: EXERCISE_DOMAIN_LABELS[d],
        count: its.length,
        rate: pct(list.flatMap((c) => its.map((i) => c.scores.get(i.exerciseId) ?? 0))),
      } satisfies ExamRate;
    }).filter((r) => r.count > 0);
  const enough = (list: Copy[]) => list.length >= STATS_THRESHOLD;
  const average = (list: Copy[]) =>
    enough(list) ? Math.round(list.reduce((a, c) => a + c.rate, 0) / list.length) : null;
  const above = (list: Copy[]) =>
    enough(list)
      ? Math.round((100 * list.filter((c) => c.rate >= threshold).length) / list.length)
      : null;
  const weakest = (list: Copy[]) => {
    if (!enough(list)) return null;
    const worst = [...domainRates(list)].sort((a, b) => a.rate - b.rate)[0];
    return worst ? { label: worst.label, rate: worst.rate } : null;
  };
  const rowOf = (key: string, name: string, group: string, cls: ClassRow[]): CampaignResultRow => {
    const list = copies.filter((c) => cls.includes(c.cls));
    return {
      id: key,
      name,
      group,
      expected: cls.reduce((a, c) => a + c.learners, 0),
      participants: list.length,
      average: average(list),
      above: above(list),
      weakest: weakest(list),
    };
  };

  const groupLabel =
    summary!.zone.kind === 'pays' ? 'DRENA' : summary!.zone.kind === 'drena' ? 'IEPP' : null;
  const groupOf = (c: ClassRow) =>
    groupLabel === 'DRENA' ? (c.drena ?? 'Sans DRENA') : (c.iepp ?? 'Sans IEPP');
  const schoolIds = [...new Set(classes.map((c) => c.school_id))];
  const schools = schoolIds
    .map((sid) => {
      const cls = classes.filter((c) => c.school_id === sid);
      return rowOf(sid, cls[0]!.school, groupLabel ? groupOf(cls[0]!) : '', cls);
    })
    .sort(sortRows);
  const groups = groupLabel
    ? [...new Set(classes.map(groupOf))]
        .map((g) =>
          rowOf(
            g,
            g,
            '',
            classes.filter((c) => groupOf(c) === g),
          ),
        )
        .sort(sortRows)
    : [];

  const ok = enough(copies);
  return {
    campaign: summary!,
    scope: pilot ? 'campagne' : 'ma-zone',
    groupLabel,
    expected: classes.reduce((a, c) => a + c.learners, 0),
    participants: copies.length,
    average: average(copies),
    above: above(copies),
    byDomain: ok ? domainRates(copies) : [],
    bySkill: ok
      ? EXERCISE_SKILLS.map((k) => {
          const its = items.filter((i) => i.skill === k);
          return {
            key: k,
            label: EXERCISE_SKILL_LABELS[k],
            count: its.length,
            rate: pct(copies.flatMap((c) => its.map((i) => c.scores.get(i.exerciseId) ?? 0))),
          } satisfies ExamRate;
        }).filter((r) => r.count > 0)
      : [],
    byQuestion: ok
      ? items.map((i) => ({
          key: i.exerciseId,
          label: i.title,
          position: i.position,
          domain: i.domain,
          count: copies.length,
          rate: pct(copies.map((c) => c.scores.get(i.exerciseId) ?? 0)),
        }))
      : [],
    groups,
    schools,
  };
}

/** Les plus faibles d'abord ; les écoles non évaluées (aucune copie) en tête. */
function sortRows(a: CampaignResultRow, b: CampaignResultRow): number {
  const key = (r: CampaignResultRow) =>
    r.participants === 0 ? -2 : r.average === null ? -1 : r.average;
  return key(a) - key(b) || a.name.localeCompare(b.name, 'fr');
}
