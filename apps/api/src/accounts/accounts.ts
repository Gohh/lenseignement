import type {
  AccountList,
  AccountListItem,
  AuditLogItem,
  AuditLogPage,
} from '@lenseignement/types';
import { and, desc, eq, gte, ilike, lt, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { auditLogs, users } from '../db/schema.js';
import { TeamError, teamPowers } from '../team/team.js';

const PAGE_SIZE = 50;

/** Recherche sans risque : les caractères spéciaux de LIKE sont pris tels quels. */
const like = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const activeRole = sql`(m.valid_until is null or m.valid_until > now())`;

async function assertEverywhere(db: Database, userId: string) {
  const powers = await teamPowers(db, userId);
  if (!powers.everywhere) {
    throw new TeamError('forbidden', 'Réservé au superadministrateur et à l’administrateur.');
  }
  return powers;
}

async function audit(
  db: Database,
  actorUserId: string,
  action: string,
  id: string,
  traceId?: string,
) {
  await db.insert(auditLogs).values({
    actorUserId,
    action,
    resourceType: 'user',
    resourceId: id,
    decision: 'allow',
    reason: 'comptes',
    traceId,
  });
}

/** Tous les comptes, avec leurs rôles d'équipe : recherche par nom, statut et rôle ou profil. */
export async function listAccounts(
  db: Database,
  userId: string,
  query: { search?: string; status?: 'active' | 'suspended'; role?: string; page: number },
): Promise<AccountList> {
  const powers = await assertEverywhere(db, userId);
  const filters: SQL[] = [];
  if (query.search) filters.push(ilike(users.displayName, like(query.search)));
  if (query.status) filters.push(eq(users.status, query.status));
  if (query.role) {
    filters.push(sql`(${query.role} = any(${users.profiles}) or exists (
      select 1 from memberships m where m.user_id = ${users.id} and m.role = ${query.role} and ${activeRole}))`);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(where);
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      profiles: users.profiles,
      status: users.status,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(where)
    .orderBy(sql`${users.displayName} is null`, users.displayName, desc(users.createdAt))
    .limit(PAGE_SIZE)
    .offset((query.page - 1) * PAGE_SIZE);

  const ids = rows.map((r) => r.id);
  const { rows: roleRows } = ids.length
    ? await db.execute(sql`
        select m.user_id, m.role, o.name as organization
          from memberships m join organizations o on o.id = m.organization_id
         where m.user_id in (${sql.join(
           ids.map((id) => sql`${id}::uuid`),
           sql`, `,
         )}) and ${activeRole}
         order by o.name`)
    : { rows: [] };
  const roles = roleRows as Array<{ user_id: string; role: string; organization: string }>;

  const items: AccountListItem[] = rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    profiles: r.profiles,
    status: r.status === 'suspended' ? 'suspended' : 'active',
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    roles: roles
      .filter((m) => m.user_id === r.id && m.role !== 'apprenant')
      .map(({ role, organization }) => ({ role, organization })),
  }));
  return { items, total, page: query.page, pageSize: PAGE_SIZE, canSeeJournal: powers.isSuper };
}

/**
 * Suspend ou réactive un compte : la personne ne peut plus rien faire sur la plateforme tant
 * qu'il est suspendu. On ne suspend ni soi-même ni un superadministrateur ; l'administrateur
 * ne suspend pas un autre administrateur.
 */
export async function setAccountStatus(
  db: Database,
  userId: string,
  targetId: string,
  status: 'active' | 'suspended',
  traceId?: string,
): Promise<void> {
  const powers = await assertEverywhere(db, userId);
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId));
  if (!target) throw new TeamError('not_found', 'Compte introuvable.');
  if (status === 'suspended') {
    if (targetId === userId) {
      throw new TeamError('invalid', 'Vous ne pouvez pas suspendre votre propre compte.');
    }
    const { rows } = await db.execute(sql`
      select m.role from memberships m
       where m.user_id = ${targetId} and m.role in ('superadministrateur', 'administrateur')
         and ${activeRole}`);
    const targetRoles = new Set((rows as Array<{ role: string }>).map((r) => r.role));
    if (targetRoles.has('superadministrateur')) {
      throw new TeamError('forbidden', 'Un compte de superadministrateur ne se suspend pas.');
    }
    if (targetRoles.has('administrateur') && !powers.isSuper) {
      throw new TeamError('forbidden', 'Seul le superadministrateur suspend un administrateur.');
    }
  }
  await db.update(users).set({ status }).where(eq(users.id, targetId));
  await audit(
    db,
    userId,
    status === 'suspended' ? 'account.suspend' : 'account.reactivate',
    targetId,
    traceId,
  );
}

/** Journal des actions, du plus récent au plus ancien. Superadministrateur seulement. */
export async function auditJournal(
  db: Database,
  userId: string,
  query: {
    domain?: string;
    decision?: 'allow' | 'deny';
    actor?: string;
    from?: string;
    to?: string;
    page: number;
  },
): Promise<AuditLogPage> {
  const powers = await teamPowers(db, userId);
  if (!powers.isSuper) {
    throw new TeamError('forbidden', 'Le journal est réservé au superadministrateur.');
  }
  const filters: SQL[] = [];
  if (query.domain) filters.push(sql`split_part(${auditLogs.action}, '.', 1) = ${query.domain}`);
  if (query.decision) filters.push(eq(auditLogs.decision, query.decision));
  if (query.actor) filters.push(ilike(users.displayName, like(query.actor)));
  if (query.from) filters.push(gte(auditLogs.occurredAt, new Date(`${query.from}T00:00:00Z`)));
  if (query.to) {
    const end = new Date(`${query.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    filters.push(lt(auditLogs.occurredAt, end));
  }
  const rows = await db
    .select({
      id: auditLogs.id,
      occurredAt: auditLogs.occurredAt,
      actorName: users.displayName,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      decision: auditLogs.decision,
      reason: auditLogs.reason,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.occurredAt))
    .limit(PAGE_SIZE + 1)
    .offset((query.page - 1) * PAGE_SIZE);
  const items: AuditLogItem[] = rows.slice(0, PAGE_SIZE).map((r) => ({
    ...r,
    occurredAt: r.occurredAt.toISOString(),
  }));
  return { items, page: query.page, hasMore: rows.length > PAGE_SIZE };
}
