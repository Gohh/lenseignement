import { GRANTABLE_ROLES } from '@lenseignement/types';
import { sql } from 'drizzle-orm';

/**
 * Codes d'invitation à usage unique pour une personne (règle de GOHH, 01/11/2026) : un élève entré
 * dans sa classe avec le code ne change plus seul ni de niveau ni de classe ; une personne entrée
 * dans une équipe (ou en attente de validation) ne saisit plus d'autre code. Seule l'équipe
 * habilitée de l'établissement change ensuite la classe ou le niveau.
 */
type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> };

const TEAM = [...GRANTABLE_ROLES, 'superadministrateur'];

export interface ActiveClass {
  id: string;
  name: string;
  organization: string;
}

/** La classe (non archivée) où l'élève est inscrit, s'il en a une. */
export async function activeClassOf(db: Executor, userId: string): Promise<ActiveClass | null> {
  const { rows } = await db.execute(sql`
    select c.id, c.name, o.name as organization
      from cohort_members cm
      join cohorts c on c.id = cm.cohort_id
      join organizations o on o.id = c.organization_id
     where cm.user_id = ${userId} and cm.role = 'apprenant'
       and c.archived_at is null and o.archived_at is null
     order by c.school_year desc, c.name
     limit 1`);
  return (rows[0] as ActiveClass | undefined) ?? null;
}

/** La personne a déjà utilisé un code d'équipe : rôle d'équipe actif, ou demande en attente. */
export async function usedTeamCode(db: Executor, userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`
    select 1 from memberships
     where user_id = ${userId}
       and role in (${sql.join(
         TEAM.map((r) => sql`${r}`),
         sql`, `,
       )})
       and (valid_until is null or valid_until > now())
    union all
    select 1 from team_join_requests where user_id = ${userId} and status = 'pending'
    limit 1`);
  return rows.length > 0;
}
