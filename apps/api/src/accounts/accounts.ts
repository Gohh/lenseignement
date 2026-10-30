import {
  GRANTABLE_ROLES,
  parseCsv,
  TEAM_ROLE_LABELS,
  type AccountImportResult,
  type AccountList,
  type AccountListItem,
  type AuditLogItem,
  type AuditLogPage,
  type CreatedAccount,
} from '@lenseignement/types';
import { and, desc, eq, gte, ilike, lt, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { auditLogs, users } from '../db/schema.js';
import { teamOrganizationIds } from '../access/access.service.js';
import { IdentityError, type IdentityAdmin } from '../team/identity-admin.js';
import { createAccount, TeamError, teamPowers } from '../team/team.js';

const PAGE_SIZE = 50;

/** Recherche sans risque : les caractères spéciaux de LIKE sont pris tels quels. */
const like = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const activeRole = sql`(m.valid_until is null or m.valid_until > now())`;

async function assertEverywhere(db: Database, userId: string) {
  const powers = await teamPowers(db, userId);
  if (!powers.everywhere || !powers.rights.has('comptes')) {
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
      level: users.level,
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
    level: r.level,
    status: r.status === 'suspended' ? 'suspended' : 'active',
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    roles: roles
      .filter((m) => m.user_id === r.id && m.role !== 'apprenant')
      .map(({ role, organization }) => ({ role, organization })),
  }));
  return {
    items,
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
    canSeeJournal: powers.rights.has('journal'),
  };
}

/**
 * Garde-fous sur le compte d'une autre personne. Avec `verb` (suspendre, supprimer…) : jamais
 * soi-même, jamais un superadministrateur, et un administrateur seulement par le
 * superadministrateur. Sans `verb` (réactiver), seul l'accès à l'écran compte.
 */
async function assertCanManage(
  db: Database,
  userId: string,
  targetId: string,
  verb: string | null,
) {
  const powers = await assertEverywhere(db, userId);
  const [target] = await db
    .select({ id: users.id, oidcSubject: users.oidcSubject, lastSeenAt: users.lastSeenAt })
    .from(users)
    .where(eq(users.id, targetId));
  if (!target) throw new TeamError('not_found', 'Compte introuvable.');
  if (verb) {
    if (targetId === userId) {
      throw new TeamError('invalid', `Vous ne pouvez pas ${verb} votre propre compte.`);
    }
    const { rows } = await db.execute(sql`
      select m.role from memberships m
       where m.user_id = ${targetId} and m.role in ('superadministrateur', 'administrateur')
         and ${activeRole}`);
    const targetRoles = new Set((rows as Array<{ role: string }>).map((r) => r.role));
    if (targetRoles.has('superadministrateur')) {
      throw new TeamError('forbidden', `On ne peut pas ${verb} un compte de superadministrateur.`);
    }
    if (targetRoles.has('administrateur') && !powers.isSuper) {
      throw new TeamError(
        'forbidden',
        `Seul le superadministrateur peut ${verb} un administrateur.`,
      );
    }
  }
  return target;
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
  await assertCanManage(db, userId, targetId, status === 'suspended' ? 'suspendre' : null);
  await db.update(users).set({ status }).where(eq(users.id, targetId));
  await audit(
    db,
    userId,
    status === 'suspended' ? 'account.suspend' : 'account.reactivate',
    targetId,
    traceId,
  );
}

/** Complète ou corrige un compte : nom affiché, profils choisis et niveau d'un apprenant. */
export async function updateAccount(
  db: Database,
  userId: string,
  targetId: string,
  input: { displayName: string; profiles: string[]; level: string | null },
  traceId?: string,
): Promise<void> {
  await assertCanManage(db, userId, targetId, targetId === userId ? null : 'modifier');
  await db
    .update(users)
    .set({
      displayName: input.displayName,
      profiles: [...new Set(input.profiles)],
      level: input.level,
    })
    .where(eq(users.id, targetId));
  await audit(db, userId, 'account.update', targetId, traceId);
}

/**
 * Supprime un compte qui n'a jamais servi (personne ne s'y est connecté, aucune donnée ne s'y
 * rattache) : fiche, rôles, classes, et le compte Keycloak. Un compte déjà utilisé se suspend.
 */
export async function deleteAccount(
  db: Database,
  identity: IdentityAdmin,
  userId: string,
  targetId: string,
  traceId?: string,
): Promise<{ removedFromKeycloak: boolean }> {
  const target = await assertCanManage(db, userId, targetId, 'supprimer');
  if (target.lastSeenAt) {
    throw new TeamError(
      'invalid',
      'Ce compte a déjà servi : il ne peut pas être supprimé. Suspendez-le plutôt.',
    );
  }
  const keycloak = identity.configured() && typeof identity.deleteUser === 'function';
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from cohort_members where user_id = ${targetId}`);
      await tx.execute(sql`delete from memberships where user_id = ${targetId}`);
      await tx.execute(sql`delete from users where id = ${targetId}`);
      // Keycloak en dernier : s'il refuse, rien n'est supprimé ici non plus.
      if (keycloak) await identity.deleteUser!(target.oidcSubject);
    });
  } catch (error) {
    if (error instanceof IdentityError) throw new TeamError('invalid', error.message);
    const code =
      (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === '23503') {
      throw new TeamError(
        'invalid',
        'Des données sont déjà rattachées à ce compte : il ne peut pas être supprimé. Suspendez-le plutôt.',
      );
    }
    throw error;
  }
  await audit(db, userId, 'account.delete', targetId, traceId);
  return { removedFromKeycloak: keycloak };
}

const IMPORT_COLUMNS = {
  lastName: /^nom/,
  firstName: /^prenom/,
  email: /(mail|courriel)/,
  role: /^(role|fonction)/,
  organization: /^(etablissement|structure|ecole)/,
} as const;

const plainText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();

/**
 * Crée des comptes d'équipe depuis un tableau : Nom ; Prénom ; E-mail ; Rôle ; Établissement.
 * Chaque ligne suit les mêmes règles qu'une création à la main (rôles accordables, structures
 * gérées). Les lignes refusées sont listées avec leur raison ; les autres sont créées.
 */
export async function importAccounts(
  db: Database,
  identity: IdentityAdmin,
  userId: string,
  csv: string,
  traceId?: string,
): Promise<AccountImportResult> {
  await assertEverywhere(db, userId);
  if (!identity.configured()) {
    throw new TeamError(
      'invalid',
      'La création de comptes n’est pas encore configurée dans Keycloak.',
    );
  }
  const rows = parseCsv(csv).map((r) => r.map((c) => c.trim()));
  const header = (rows.shift() ?? []).map(plainText);
  const col = Object.fromEntries(
    Object.entries(IMPORT_COLUMNS).map(([k, re]) => [k, header.findIndex((h) => re.test(h))]),
  ) as Record<keyof typeof IMPORT_COLUMNS, number>;
  if (Object.values(col).some((i) => i < 0)) {
    throw new TeamError(
      'invalid',
      'La première ligne doit donner les titres : Nom ; Prénom ; E-mail ; Rôle ; Établissement. Partez du modèle.',
    );
  }
  if (rows.length === 0) throw new TeamError('invalid', 'Le tableau ne contient aucun compte.');
  if (rows.length > 200) throw new TeamError('invalid', 'Au plus 200 comptes à la fois.');

  const { rows: orgRows } = await db.execute(sql`
    select o.id, o.name from organizations o
     where o.id in ${teamOrganizationIds(userId)} and o.archived_at is null`);
  const orgsByName = new Map<string, Array<{ id: string; name: string }>>();
  for (const o of orgRows as Array<{ id: string; name: string }>) {
    const key = plainText(o.name);
    orgsByName.set(key, [...(orgsByName.get(key) ?? []), o]);
  }
  const roleOf = (raw: string) => {
    const wanted = plainText(raw);
    return GRANTABLE_ROLES.find(
      (r) => r === wanted || plainText(TEAM_ROLE_LABELS[r] ?? '') === wanted,
    );
  };

  const created: CreatedAccount[] = [];
  const failed: AccountImportResult['failed'] = [];
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const cell = (k: keyof typeof IMPORT_COLUMNS) => row[col[k]] ?? '';
    const name = `${cell('firstName')} ${cell('lastName')}`.trim();
    const fail = (reason: string) => failed.push({ line, name: name || '(sans nom)', reason });
    if (!cell('firstName') || !cell('lastName')) {
      fail('Il manque le nom ou le prénom.');
      continue;
    }
    const role = roleOf(cell('role'));
    if (!role) {
      fail(`Rôle inconnu : « ${cell('role')} ».`);
      continue;
    }
    const orgs = orgsByName.get(plainText(cell('organization'))) ?? [];
    if (orgs.length !== 1) {
      fail(
        orgs.length === 0
          ? `Établissement introuvable : « ${cell('organization')} ».`
          : `Plusieurs établissements portent ce nom : « ${cell('organization')} ».`,
      );
      continue;
    }
    const email = cell('email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail(`Adresse e-mail invalide : « ${cell('email')} ».`);
      continue;
    }
    try {
      created.push(
        await createAccount(
          db,
          identity,
          userId,
          { displayName: name, email, organizationId: orgs[0]!.id, role, branches: null },
          traceId,
        ),
      );
    } catch (error) {
      if (error instanceof TeamError) fail(error.message);
      else throw error;
    }
  }
  return { created, failed };
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
  if (!powers.rights.has('journal')) {
    throw new TeamError(
      'forbidden',
      'Le journal est réservé au superadministrateur et aux administrateurs.',
    );
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
