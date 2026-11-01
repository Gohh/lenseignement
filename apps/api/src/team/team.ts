import { randomInt } from 'node:crypto';
import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import {
  GRANTABLE_ROLES,
  LEVEL_GROUPS,
  NAMES_BY_ROLE,
  ORGANIZATION_TYPE_LABELS,
  roleFitsStructure,
  TEAM_ROLE_LABELS,
  levelsForOrganizationType,
  MAX_ADMINISTRATORS,
  TEACHING_ROLES,
  type InvitationPreview,
  type RedeemResult,
  type CreatedAccount,
  type InvitationList,
  type InvitationState,
  type TeamMember,
  type TeamOverview,
} from '@lenseignement/types';
import { inspectionOrganizationIds, teamOrganizationIds } from '../access/access.service.js';
import { rightsForRoles } from './rights.js';
import type { Database, Executor } from '../db/database.js';
import { IdentityError, temporaryPassword, type IdentityAdmin } from './identity-admin.js';
import {
  auditLogs,
  memberships,
  membershipInvitations,
  organizations,
  teamJoinRequests,
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

async function activeRoles(db: Executor, userId: string): Promise<Set<string>> {
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
  const rights = await rightsForRoles(db, roles);
  return {
    isSuper,
    /** Voit et crée partout : le superadministrateur et son adjoint. */
    everywhere: isSuper || isAdmin,
    /** Crée un établissement, dans sa zone s'il n'a que le rôle de gestionnaire. */
    canCreateOrganization: rights.has('etablissements'),
    grantable: rights.has('equipe') ? grantableForRoles(roles) : [],
    /** Droits réglés dans l'écran « Droits ». */
    rights,
  };
}

/**
 * Rôles accordables, toutes structures confondues : le superadministrateur donne tout
 * (administrateur compris) ; son adjoint, tout sauf un administrateur ; les autres, d'après la
 * grille « qui nomme qui » (`NAMES_BY_ROLE`).
 */
function grantableForRoles(roles: Set<string>): string[] {
  if (roles.has('superadministrateur')) return [...GRANTABLE_ROLES];
  if (roles.has('administrateur')) return GRANTABLE_ROLES.filter((r) => r !== 'administrateur');
  const names = new Set<string>();
  for (const role of roles) for (const r of NAMES_BY_ROLE[role] ?? []) names.add(r);
  return GRANTABLE_ROLES.filter((r) => names.has(r));
}

/**
 * Peut-elle donner ce rôle dans cette structure ? Le rôle doit convenir au type de structure, et la
 * personne doit le nommer depuis un rôle qu'elle tient sur cette structure ou au-dessus (DRENA),
 * ou, pour l'IEPP et le conseiller Alpha, sur les écoles et centres qu'ils suivent.
 */
export async function assertCanGrant(
  db: Executor,
  userId: string,
  role: string,
  organizationId: string,
) {
  const [org] = await db
    .select({ type: organizations.type })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) throw new TeamError('not_found', 'Structure introuvable.');
  if (!roleFitsStructure(role, org.type)) {
    const label = TEAM_ROLE_LABELS[role] ?? role;
    throw new TeamError(
      'invalid',
      `Le rôle « ${label} » ne se donne pas dans ce type de structure (${
        ORGANIZATION_TYPE_LABELS[org.type as keyof typeof ORGANIZATION_TYPE_LABELS] ?? org.type
      }).`,
    );
  }
  const roles = await activeRoles(db, userId);
  const rights = await rightsForRoles(db, roles);
  if (!rights.has('equipe')) throw new TeamError('forbidden', 'Accès refusé.');
  if (roles.has('superadministrateur') || roles.has('administrateur')) {
    if (grantableForRoles(roles).includes(role)) return;
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  // Rôles de la personne qui couvrent la structure : sur elle, sur ses parents, ou par le suivi
  // (IEPP pour ses écoles, conseiller Alpha pour ses centres).
  const { rows } = await db.execute<{ role: string }>(sql`
    select distinct m.role from memberships m
     where m.user_id = ${userId} and (m.valid_until is null or m.valid_until > now())
       and m.organization_id in (
         with recursive up as (
           select ${organizationId}::uuid as id
           union select o.parent_id from organizations o join up on o.id = up.id
            where o.parent_id is not null)
         select id from up)
    union
    select m.role from memberships m
     where m.user_id = ${userId} and (m.valid_until is null or m.valid_until > now())
       and m.role in ('iepp', 'conseiller-alpha')
       and ${organizationId}::uuid in ${inspectionOrganizationIds(userId)}`);
  const here = new Set(rows.map((r) => r.role));
  if ([...here].some((r) => (NAMES_BY_ROLE[r] ?? []).includes(role as never))) return;
  throw new TeamError('forbidden', 'Accès refusé.');
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
      levels: memberships.levels,
      subjects: memberships.subjects,
      organization: {
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
      },
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
    levels: r.levels,
    subjects: r.subjects,
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
  input: { organizationId: string; role: string; branches: string[] | null; days?: number },
  traceId?: string,
): Promise<{ code: string; expiresAt: string }> {
  await assertManages(db, userId, input.organizationId);
  await assertActive(db, input.organizationId);
  await assertCanGrant(db, userId, input.role, input.organizationId);
  await assertAdminSeat(db, input.role);
  const expiresAt = new Date(Date.now() + (input.days ?? INVITATION_DAYS) * 24 * 3600 * 1000);
  const code = newCode();
  await db.insert(membershipInvitations).values({
    code,
    organizationId: input.organizationId,
    role: input.role as never,
    branches: input.branches,
    createdByUserId: userId,
    expiresAt,
    // Un code d'enseignant sert à autant de personnes que nécessaire : chacune est validée par la
    // direction. Les autres rôles entrent tout de suite : leur code ne sert qu'une fois.
    maxUses: isTeaching(input.role) ? null : 1,
  });
  await audit(db, userId, 'team.invitation.create', input.organizationId, traceId);
  return { code, expiresAt: expiresAt.toISOString() };
}

const isTeaching = (role: string) => (TEACHING_ROLES as readonly string[]).includes(role);

/** Invitation encore valable pour ce code (pas révoquée, pas expirée, pas épuisée). */
async function usableInvitation(db: Executor, rawCode: string, lock = false) {
  const code = rawCode.replace(/[\s-]/g, '').toUpperCase();
  const query = db
    .select()
    .from(membershipInvitations)
    .where(
      and(
        eq(membershipInvitations.code, code),
        isNull(membershipInvitations.revokedAt),
        gt(membershipInvitations.expiresAt, new Date()),
        sql`(${membershipInvitations.maxUses} is null or ${membershipInvitations.uses} < ${membershipInvitations.maxUses})`,
      ),
    );
  const [invitation] = lock ? await query.for('update') : await query;
  if (!invitation) throw new TeamError('not_found', 'Code invalide ou expiré.');
  return invitation;
}

/** Niveaux de l'établissement, et matières des programmes publiés pour ces niveaux. */
async function levelsAndSubjects(db: Executor, organizationId: string) {
  const [org] = await db
    .select({ name: organizations.name, type: organizations.type })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const levels = levelsForOrganizationType(org!.type);
  const codes = new Set(levels.map((l) => l.code as string));
  const branches = [
    ...new Set(
      LEVEL_GROUPS.filter((g) => g.levels.some((l) => codes.has(l.code))).map((g) => g.branch),
    ),
  ];
  let subjects: string[] = [];
  if (branches.length > 0) {
    const { rows } = await db.execute<{ title: string }>(sql`
      select distinct s.title from subjects s
        join curriculum_versions v on v.id = s.version_id and v.status = 'published'
        join curricula c on c.id = v.curriculum_id
       where c.branch in (${sql.join(
         branches.map((b) => sql`${b}`),
         sql`, `,
       )})
       order by s.title`);
    subjects = rows.map((r) => r.title);
  }
  return { name: org!.name, levels: [...levels], subjects };
}

/** Cycles qui correspondent à des niveaux (pour filtrer les contenus comme avant). */
export function branchesOfLevels(levels: readonly string[]): string[] {
  return [
    ...new Set(
      LEVEL_GROUPS.filter((g) => g.levels.some((l) => levels.includes(l.code))).map(
        (g) => g.branch,
      ),
    ),
  ];
}

const cleanSubjects = (subjects: readonly string[]) => [
  ...new Map(
    subjects
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => [s.toLowerCase(), s]),
  ).values(),
];

/** Ce que la personne verra en saisissant le code : établissement, rôle, niveaux, matières. */
export async function previewInvitation(db: Database, rawCode: string): Promise<InvitationPreview> {
  const invitation = await usableInvitation(db, rawCode);
  const found = await levelsAndSubjects(db, invitation.organizationId);
  return {
    organization: found.name,
    role: invitation.role,
    needsValidation: isTeaching(invitation.role),
    levels: found.levels,
    subjects: found.subjects,
  };
}

/**
 * La personne saisit le code. Rôle qui enseigne : elle envoie ses niveaux et matières, et attend la
 * validation de la direction. Autre rôle : elle rejoint l'équipe tout de suite.
 */
export async function redeemTeamInvitation(
  db: Database,
  userId: string,
  input: { code: string; levels?: string[]; subjects?: string[] },
  traceId?: string,
): Promise<RedeemResult> {
  const result = await db.transaction(async (tx) => {
    const invitation = await usableInvitation(tx, input.code, true);
    const [org] = await tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, invitation.organizationId));
    if (isTeaching(invitation.role)) {
      const { levels: allowed } = await levelsAndSubjects(tx, invitation.organizationId);
      const levels = (input.levels ?? []).filter((l) => allowed.some((a) => a.code === l));
      const subjects = cleanSubjects(input.subjects ?? []);
      if (levels.length === 0) throw new TeamError('invalid', 'Choisissez au moins un niveau.');
      if (subjects.length === 0) throw new TeamError('invalid', 'Choisissez au moins une matière.');
      const { rows: already } = await tx.execute(sql`
        select 1 from memberships where user_id = ${userId}
           and organization_id = ${invitation.organizationId} and role = ${invitation.role}
           and (valid_until is null or valid_until > now())`);
      if (already.length > 0)
        throw new TeamError('invalid', 'Vous faites déjà partie de cette équipe.');
      // Une seule demande en attente par personne et par équipe : la nouvelle remplace l'ancienne.
      await tx
        .delete(teamJoinRequests)
        .where(
          and(
            eq(teamJoinRequests.userId, userId),
            eq(teamJoinRequests.organizationId, invitation.organizationId),
            eq(teamJoinRequests.role, invitation.role),
            eq(teamJoinRequests.status, 'pending'),
          ),
        );
      await tx.insert(teamJoinRequests).values({
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
        levels,
        subjects,
      });
    } else {
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
    }
    await tx
      .update(membershipInvitations)
      .set({
        usedByUserId: userId,
        usedAt: sql`now()`,
        uses: sql`${membershipInvitations.uses} + 1`,
      })
      .where(eq(membershipInvitations.id, invitation.id));
    return {
      organizationId: invitation.organizationId,
      organization: org!.name,
      role: invitation.role,
      pending: isTeaching(invitation.role),
    };
  });
  await audit(
    db,
    userId,
    result.pending ? 'team.request.create' : 'team.invitation.redeem',
    result.organizationId,
    traceId,
  );
  return { organization: result.organization, role: result.role, pending: result.pending };
}

/** Invitations des structures que la personne gère, les plus récentes d'abord. */
export async function listInvitations(db: Database, userId: string): Promise<InvitationList> {
  const scope = teamOrganizationIds(userId);
  const powers = await teamPowers(db, userId);
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(sql`${organizations.id} in ${scope} and ${organizations.archivedAt} is null`)
    .orderBy(asc(organizations.name));
  const { rows } = await db.execute(sql`
    select i.id, i.code, i.role, i.created_at, i.expires_at, i.used_at, i.revoked_at, i.uses, i.max_uses,
           o.id as org_id, o.name as org_name,
           cu.display_name as created_by, uu.display_name as used_by
      from membership_invitations i
      join organizations o on o.id = i.organization_id
      left join users cu on cu.id = i.created_by_user_id
      left join users uu on uu.id = i.used_by_user_id
     where i.organization_id in ${scope}
     order by i.created_at desc
     limit 200`);
  const now = Date.now();
  const items = rows.map((r) => {
    const row = r as Record<string, unknown>;
    const expiresAt = new Date(row.expires_at as string);
    const uses = Number(row.uses);
    const maxUses = row.max_uses == null ? null : Number(row.max_uses);
    const state: InvitationState = row.revoked_at
      ? 'revoked'
      : maxUses !== null && uses >= maxUses
        ? 'used'
        : expiresAt.getTime() <= now
          ? 'expired'
          : 'active';
    return {
      id: String(row.id),
      code: String(row.code),
      role: String(row.role),
      organization: { id: String(row.org_id), name: String(row.org_name) },
      createdAt: new Date(row.created_at as string).toISOString(),
      expiresAt: expiresAt.toISOString(),
      createdByName: (row.created_by as string | null) ?? null,
      usedByName: (row.used_by as string | null) ?? null,
      usedAt: row.used_at ? new Date(row.used_at as string).toISOString() : null,
      state,
      uses,
      maxUses,
    };
  });
  return { organizations: orgs, grantable: powers.grantable, items };
}

/** La direction annule une invitation pas encore utilisée : le code ne marche plus. */
export async function revokeInvitation(
  db: Database,
  userId: string,
  invitationId: string,
  traceId?: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(membershipInvitations)
    .where(eq(membershipInvitations.id, invitationId));
  if (!row) throw new TeamError('not_found', 'Invitation introuvable.');
  await assertManages(db, userId, row.organizationId).catch(() => {
    throw new TeamError('not_found', 'Invitation introuvable.');
  });
  const powers = await teamPowers(db, userId);
  if (!powers.isSuper && !powers.grantable.includes(row.role)) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  if (row.maxUses !== null && row.uses >= row.maxUses) {
    throw new TeamError('invalid', 'Ce code a déjà été utilisé.');
  }
  if (row.revokedAt) return;
  await db
    .update(membershipInvitations)
    .set({ revokedAt: sql`now()` })
    .where(eq(membershipInvitations.id, row.id));
  await audit(db, userId, 'team.invitation.revoke', row.organizationId, traceId);
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
  await assertCanGrant(db, userId, input.role, input.organizationId);
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
