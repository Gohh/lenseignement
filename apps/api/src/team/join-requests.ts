import { and, eq, sql } from 'drizzle-orm';
import {
  levelsForOrganizationType,
  type JoinRequest,
  type JoinRequestStatus,
} from '@lenseignement/types';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { memberships, teamJoinRequests } from '../db/schema.js';
import { assertManages, audit, branchesOfLevels, TeamError, teamPowers } from './team.js';

type Row = {
  id: string;
  user_name: string | null;
  role: string;
  org_id: string;
  org_name: string;
  org_type: string;
  levels: string[];
  subjects: string[];
  status: JoinRequestStatus;
  created_at: string;
};

const toRequest = (r: Row): JoinRequest => ({
  id: r.id,
  userName: r.user_name,
  role: r.role,
  organization: { id: r.org_id, name: r.org_name },
  levels: r.levels,
  subjects: r.subjects,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  levelOptions: [...levelsForOrganizationType(r.org_type)],
});

const SELECT = sql`
  select r.id, u.display_name as user_name, r.role, o.id as org_id, o.name as org_name,
         o.type as org_type, r.levels, r.subjects, r.status, r.created_at
    from team_join_requests r
    join organizations o on o.id = r.organization_id
    join users u on u.id = r.user_id`;

/** Demandes en attente dans les équipes que la personne gère (rôles qu'elle peut accorder). */
export async function pendingRequests(db: Database, userId: string): Promise<JoinRequest[]> {
  const powers = await teamPowers(db, userId);
  if (powers.grantable.length === 0) return [];
  const { rows } = await db.execute<Row>(sql`${SELECT}
     where r.status = 'pending' and r.organization_id in ${teamOrganizationIds(userId)}
       and r.role in (${sql.join(
         powers.grantable.map((g) => sql`${g}`),
         sql`, `,
       )})
     order by r.created_at`);
  return rows.map(toRequest);
}

/** Nombre de demandes en attente, pour la cloche de la direction. */
export async function pendingRequestCount(db: Database, userId: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from team_join_requests r
     where r.status = 'pending' and r.organization_id in (
       select t.id from ${teamOrganizationIds(userId)} t)`);
  return rows[0]?.n ?? 0;
}

/** Mes propres demandes (en attente ou refusées récemment), pour savoir où j'en suis. */
export async function myRequests(db: Database, userId: string): Promise<JoinRequest[]> {
  const { rows } = await db.execute<Row>(sql`${SELECT}
     where r.user_id = ${userId}
       and (r.status = 'pending' or r.decided_at > now() - interval '30 days')
     order by r.created_at desc`);
  return rows.map(toRequest);
}

async function managedRequest(db: Database, userId: string, requestId: string) {
  const [row] = await db.select().from(teamJoinRequests).where(eq(teamJoinRequests.id, requestId));
  if (!row) throw new TeamError('not_found', 'Demande introuvable.');
  await assertManages(db, userId, row.organizationId).catch(() => {
    throw new TeamError('not_found', 'Demande introuvable.');
  });
  if (!(await teamPowers(db, userId)).grantable.includes(row.role)) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  if (row.status !== 'pending') throw new TeamError('invalid', 'Cette demande est déjà traitée.');
  return row;
}

/** La direction valide : la personne entre dans l'équipe avec les niveaux et matières retenus. */
export async function approveRequest(
  db: Database,
  userId: string,
  requestId: string,
  input: { levels: string[]; subjects: string[] },
  traceId?: string,
): Promise<void> {
  const row = await managedRequest(db, userId, requestId);
  const [org] = await db
    .execute<{ type: string }>(sql`select type from organizations where id = ${row.organizationId}`)
    .then((r) => r.rows);
  const allowed = levelsForOrganizationType(org!.type).map((l) => l.code as string);
  const levels = input.levels.filter((l) => allowed.includes(l));
  const subjects = [...new Set(input.subjects.map((s) => s.trim()).filter(Boolean))];
  if (levels.length === 0) throw new TeamError('invalid', 'Choisissez au moins un niveau.');
  if (subjects.length === 0) throw new TeamError('invalid', 'Choisissez au moins une matière.');
  const branches = branchesOfLevels(levels);
  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({
        userId: row.userId,
        organizationId: row.organizationId,
        role: row.role,
        branches,
        levels,
        subjects,
      })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.organizationId, memberships.role],
        set: { validUntil: null, branches, levels, subjects },
      });
    await tx
      .update(teamJoinRequests)
      .set({ status: 'approved', levels, subjects, decidedByUserId: userId, decidedAt: sql`now()` })
      .where(and(eq(teamJoinRequests.id, row.id), eq(teamJoinRequests.status, 'pending')));
  });
  await audit(db, userId, 'team.request.approve', row.organizationId, traceId);
}

export async function refuseRequest(
  db: Database,
  userId: string,
  requestId: string,
  traceId?: string,
): Promise<void> {
  const row = await managedRequest(db, userId, requestId);
  await db
    .update(teamJoinRequests)
    .set({ status: 'refused', decidedByUserId: userId, decidedAt: sql`now()` })
    .where(eq(teamJoinRequests.id, row.id));
  await audit(db, userId, 'team.request.refuse', row.organizationId, traceId);
}
