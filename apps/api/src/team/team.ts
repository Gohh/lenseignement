import { randomInt } from 'node:crypto';
import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import {
  GRANTABLE_ROLES,
  MAX_ADMINISTRATORS,
  type CreatedAccount,
  type TeamMember,
  type TeamOverview,
} from '@lenseignement/types';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database, Executor } from '../db/database.js';
import { IdentityError, temporaryPassword, type IdentityAdmin } from './identity-admin.js';
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

async function activeRoles(db: Database, userId: string): Promise<Set<string>> {
  const { rows } = await db.execute(
    sql`select distinct m.role from memberships m where m.user_id = ${userId}
        and (m.valid_until is null or m.valid_until > now())`,
  );
  return new Set(rows.map((r) => String((r as { role: string }).role)));
}

/** Ce que la personne peut faire pour les équipes et les établissements, d'après ses rôles. */
export async function teamPowers(db: Database, userId: string) {
  const roles = await activeRoles(db, userId);
  const isSuper = roles.has('superadministrateur');
  const isAdmin = roles.has('administrateur');
  return {
    isSuper,
    /** Voit et crée partout : le superadministrateur et son adjoint. */
    everywhere: isSuper || isAdmin,
    /** Crée un établissement, dans sa zone s'il n'a que le rôle de gestionnaire. */
    canCreateOrganization: isSuper || isAdmin || roles.has('gestionnaire'),
    grantable: grantableForRoles(roles),
  };
}

/**
 * Rôles accordables : le superadministrateur donne tout (administrateur compris) ; son adjoint et
 * la direction, tout sauf une direction ou un administrateur ; le gestionnaire seul, enseignant,
 * alphabétiseur et référent dans sa zone.
 */
function grantableForRoles(roles: Set<string>): string[] {
  if (roles.has('superadministrateur')) return [...GRANTABLE_ROLES];
  if (roles.has('administrateur') || roles.has('chef-etablissement')) {
    return GRANTABLE_ROLES.filter((r) => r !== 'chef-etablissement' && r !== 'administrateur');
  }
  if (roles.has('gestionnaire')) {
    return ['enseignant', 'alphabetiseur', 'referent-pedagogique'];
  }
  return [];
}

export async function audit(
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

/** Directions régionales (structures de type « autorité ») dans le champ de la personne. */
async function directionsOf(
  db: Database,
  scope: SQL,
): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(
      sql`${organizations.type} = 'authority' and ${organizations.id} in ${scope} and ${organizations.archivedAt} is null`,
    )
    .orderBy(asc(organizations.name));
}

/** Structures, équipe et rôles accordables, pour la personne qui gère une équipe. */
export async function teamOverview(db: Database, userId: string): Promise<TeamOverview> {
  const scope = teamOrganizationIds(userId);
  const powers = await teamPowers(db, userId);
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(sql`${organizations.id} in ${scope} and ${organizations.archivedAt} is null`)
    .orderBy(asc(organizations.name));
  // Plateforme vide : le superadministrateur doit quand même pouvoir créer le premier établissement.
  if (orgs.length === 0)
    return {
      organizations: [],
      members: [],
      grantable: [],
      canCreateOrganization: powers.canCreateOrganization,
      everywhere: powers.everywhere,
      directions: [],
    };
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
  return {
    organizations: orgs,
    members,
    grantable: powers.grantable,
    canCreateOrganization: powers.canCreateOrganization,
    everywhere: powers.everywhere,
    directions: await directionsOf(db, scope),
  };
}

export async function assertManages(db: Database, userId: string, organizationId: string) {
  const { rows } = await db.execute(
    sql`select 1 from ${teamOrganizationIds(userId)} t where t.id = ${organizationId}`,
  );
  if (rows.length === 0) throw new TeamError('forbidden', 'Accès refusé.');
}

/** Une structure archivée ne reçoit plus d'invitation. */
async function assertActive(db: Database, organizationId: string) {
  const { rows } = await db.execute(
    sql`select 1 from organizations where id = ${organizationId} and archived_at is null`,
  );
  if (rows.length === 0) throw new TeamError('invalid', 'Cet établissement est archivé.');
}

/** Trois administrateurs au plus : refuse d'en ajouter un quatrième (la personne déjà admin passe). */
async function assertAdminSeat(db: Executor, role: string, userId?: string) {
  if (role !== 'administrateur') return;
  const { rows } = await db.execute<{ n: number; already: boolean }>(sql`
    select count(distinct m.user_id)::int as n,
           coalesce(bool_or(m.user_id = ${userId ?? null}), false) as already
      from memberships m
     where m.role = 'administrateur' and (m.valid_until is null or m.valid_until > now())`);
  const { n, already } = rows[0]!;
  if (!already && n >= MAX_ADMINISTRATORS) {
    throw new TeamError(
      'invalid',
      `Il y a déjà ${MAX_ADMINISTRATORS} administrateurs : retirez d’abord ce rôle à l’un d’eux.`,
    );
  }
}

export async function createTeamInvitation(
  db: Database,
  userId: string,
  input: { organizationId: string; role: string; branches: string[] | null },
  traceId?: string,
): Promise<{ code: string; expiresAt: string }> {
  await assertManages(db, userId, input.organizationId);
  await assertActive(db, input.organizationId);
  if (!(await teamPowers(db, userId)).grantable.includes(input.role)) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  await assertAdminSeat(db, input.role);
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
    await assertAdminSeat(tx, invitation.role, userId);
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
      userId: memberships.userId,
      organizationId: memberships.organizationId,
      role: memberships.role,
    })
    .from(memberships)
    .where(eq(memberships.id, memberId));
  if (!row) throw new TeamError('not_found', 'Membre introuvable.');
  await assertManages(db, userId, row.organizationId).catch(() => {
    throw new TeamError('not_found', 'Membre introuvable.');
  });
  // On ne touche qu'aux rôles qu'on a le droit d'accorder (le superadministrateur, à tous).
  const powers = await teamPowers(db, userId);
  if (!powers.isSuper && !powers.grantable.includes(row.role)) {
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
  // Garde-fou : on ne se retire pas son propre rôle (un clic de trop et on perd l'accès), et le
  // rôle de superadministrateur ne se retire jamais depuis l'écran (il se donne par la commande).
  if (row.userId === userId) {
    throw new TeamError('forbidden', 'Vous ne pouvez pas retirer votre propre rôle.');
  }
  if (row.role === 'superadministrateur') {
    throw new TeamError('forbidden', 'Le rôle de superadministrateur ne se retire pas ici.');
  }
  await db
    .update(memberships)
    .set({ validUntil: sql`now()` })
    .where(eq(memberships.id, row.id));
  await audit(db, userId, 'team.member.remove', row.organizationId, traceId);
}

/**
 * Crée le compte d'une personne de l'équipe : Keycloak (mot de passe provisoire à changer à la
 * première connexion), puis la fiche et le rattachement avec le rôle choisi. Mêmes droits qu'une
 * invitation.
 */
export async function createAccount(
  db: Database,
  identity: IdentityAdmin,
  userId: string,
  input: {
    displayName: string;
    email: string;
    organizationId: string;
    role: string;
    branches: string[] | null;
  },
  traceId?: string,
): Promise<CreatedAccount> {
  await assertManages(db, userId, input.organizationId);
  await assertActive(db, input.organizationId);
  if (!(await teamPowers(db, userId)).grantable.includes(input.role)) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  await assertAdminSeat(db, input.role);
  const [firstName, ...rest] = input.displayName.split(/\s+/);
  const password = temporaryPassword();
  const created = await identity
    .createUser({
      username: input.email,
      email: input.email,
      firstName: firstName!,
      lastName: rest.join(' '),
      temporaryPassword: password,
    })
    .catch((error: unknown) => {
      if (error instanceof IdentityError) throw new TeamError('invalid', error.message);
      throw error;
    });
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId));
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ oidcSubject: created.id, displayName: input.displayName, accountType: 'staff' })
      .onConflictDoUpdate({
        target: users.oidcSubject,
        set: { displayName: input.displayName, accountType: 'staff' },
      })
      .returning({ id: users.id });
    await tx
      .insert(memberships)
      .values({
        userId: user!.id,
        organizationId: input.organizationId,
        role: input.role as never,
        branches: input.branches,
      })
      .onConflictDoNothing();
  });
  await audit(db, userId, 'team.account.create', input.organizationId, traceId);
  return {
    email: input.email,
    displayName: input.displayName,
    organization: org!.name,
    role: input.role,
    temporaryPassword: password,
  };
}
