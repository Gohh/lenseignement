import { randomInt } from 'node:crypto';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { GRANTABLE_ROLES, type TeamMember, type TeamOverview } from '@lenseignement/types';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import {
  auditLogs,
  memberships,
  membershipInvitations,
  organizations,
  users,
} from '../db/schema.js';

export class TeamError extends Error {
  constructor(
    readonly kind: 'invalid' | 'not_found' | 'forbidden',
    message: string,
  ) {
    super(message);
  }
}

const INVITATION_DAYS = 7;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Rôles d'équipe affichés ; les apprenants sont trop nombreux et ont leurs propres écrans. */
const STAFF_ROLES = [...GRANTABLE_ROLES, 'superadministrateur'];

const newCode = () =>
  Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

async function isSuper(db: Database, userId: string): Promise<boolean> {
  const { rows } = await db.execute(
    sql`select 1 from memberships m where m.user_id = ${userId} and m.role = 'superadministrateur'
        and (m.valid_until is null or m.valid_until > now()) limit 1`,
  );
  return rows.length > 0;
}

/** Rôles que la personne peut accorder : la direction d'un établissement, seulement le superadministrateur. */
async function grantableFor(db: Database, userId: string): Promise<string[]> {
  return (await isSuper(db, userId))
    ? [...GRANTABLE_ROLES]
    : GRANTABLE_ROLES.filter((r) => r !== 'chef-etablissement');
}

async function audit(
  db: Database,
  actorUserId: string,
  action: string,
  resourceId: string,
  traceId?: string,
) {
  await db.insert(auditLogs).values({
    actorUserId,
    action,
    resourceType: 'organization',
    resourceId: resourceId.slice(0, 64),
    decision: 'allow',
    reason: 'team',
    traceId,
  });
}

/** Structures, équipe et rôles accordables, pour la personne qui gère une équipe. */
export async function teamOverview(db: Database, userId: string): Promise<TeamOverview> {
  const scope = teamOrganizationIds(userId);
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(sql`${organizations.id} in ${scope}`)
    .orderBy(asc(organizations.name));
  if (orgs.length === 0) return { organizations: [], members: [], grantable: [] };
  const rows = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      userName: users.displayName,
      role: memberships.role,
      branches: memberships.branches,
      organization: { id: organizations.id, name: organizations.name },
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        sql`${memberships.organizationId} in ${scope}`,
        sql`${memberships.role} in (${sql.join(
          STAFF_ROLES.map((r) => sql`${r}`),
          sql`, `,
        )})`,
        sql`(${memberships.validUntil} is null or ${memberships.validUntil} > now())`,
      ),
    )
    .orderBy(asc(organizations.name), asc(users.displayName), asc(memberships.role));
  const members: TeamMember[] = rows.map((r) => ({
    id: r.id,
    userName: r.userName,
    role: r.role,
    organization: r.organization,
    branches: r.branches,
    isSelf: r.userId === userId,
  }));
  return { organizations: orgs, members, grantable: await grantableFor(db, userId) };
}

async function assertManages(db: Database, userId: string, organizationId: string) {
  const { rows } = await db.execute(
    sql`select 1 from ${teamOrganizationIds(userId)} t where t.id = ${organizationId}`,
  );
  if (rows.length === 0) throw new TeamError('forbidden', 'Accès refusé.');
}

export async function createTeamInvitation(
  db: Database,
  userId: string,
  input: { organizationId: string; role: string; branches: string[] | null },
  traceId?: string,
): Promise<{ code: string; expiresAt: string }> {
  await assertManages(db, userId, input.organizationId);
  if (!(await grantableFor(db, userId)).includes(input.role)) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 3600 * 1000);
  const code = newCode();
  await db.insert(membershipInvitations).values({
    code,
    organizationId: input.organizationId,
    role: input.role as never,
    branches: input.branches,
    createdByUserId: userId,
    expiresAt,
  });
  await audit(db, userId, 'team.invitation.create', input.organizationId, traceId);
  return { code, expiresAt: expiresAt.toISOString() };
}

/** La personne saisit le code : elle rejoint l'équipe avec le rôle et les cycles prévus. */
export async function redeemTeamInvitation(
  db: Database,
  userId: string,
  rawCode: string,
  traceId?: string,
): Promise<{ organization: string; role: string }> {
  const code = rawCode.replace(/[\s-]/g, '').toUpperCase();
  const result = await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(membershipInvitations)
      .where(
        and(
          eq(membershipInvitations.code, code),
          isNull(membershipInvitations.usedAt),
          gt(membershipInvitations.expiresAt, new Date()),
        ),
      )
      .for('update');
    if (!invitation) throw new TeamError('not_found', 'Code invalide ou expiré.');
    await tx
      .insert(memberships)
      .values({
        userId,
        organizationId: invitation.organizationId,
        role: invitation.role,
        branches: invitation.branches,
      })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.organizationId, memberships.role],
        set: { validUntil: null, branches: invitation.branches },
      });
    await tx
      .update(membershipInvitations)
      .set({ usedByUserId: userId, usedAt: sql`now()` })
      .where(eq(membershipInvitations.id, invitation.id));
    const [org] = await tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, invitation.organizationId));
    return {
      organizationId: invitation.organizationId,
      organization: org!.name,
      role: invitation.role,
    };
  });
  await audit(db, userId, 'team.invitation.redeem', result.organizationId, traceId);
  return { organization: result.organization, role: result.role };
}

async function managedMembership(db: Database, userId: string, memberId: string) {
  const [row] = await db
    .select({
      id: memberships.id,
      organizationId: memberships.organizationId,
      role: memberships.role,
    })
    .from(memberships)
    .where(eq(memberships.id, memberId));
  if (!row) throw new TeamError('not_found', 'Membre introuvable.');
  await assertManages(db, userId, row.organizationId).catch(() => {
    throw new TeamError('not_found', 'Membre introuvable.');
  });
  // Seul un superadministrateur touche aux superadministrateurs et aux directions.
  if (
    (row.role === 'superadministrateur' || row.role === 'chef-etablissement') &&
    !(await isSuper(db, userId))
  ) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  return row;
}

export async function updateMemberBranches(
  db: Database,
  userId: string,
  memberId: string,
  branches: string[] | null,
  traceId?: string,
): Promise<void> {
  const row = await managedMembership(db, userId, memberId);
  await db.update(memberships).set({ branches }).where(eq(memberships.id, row.id));
  await audit(db, userId, 'team.member.update', row.organizationId, traceId);
}

export async function removeMember(
  db: Database,
  userId: string,
  memberId: string,
  traceId?: string,
): Promise<void> {
  const row = await managedMembership(db, userId, memberId);
  await db
    .update(memberships)
    .set({ validUntil: sql`now()` })
    .where(eq(memberships.id, row.id));
  await audit(db, userId, 'team.member.remove', row.organizationId, traceId);
}
