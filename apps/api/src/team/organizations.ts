import { eq, sql } from 'drizzle-orm';
import {
  ORGANIZATION_TYPE_LABELS,
  parseCsv,
  type CreatedOrganization,
  type MyEstablishment,
  type OrganizationDetail,
  type OrganizationListItem,
  type OrganizationImportLine,
  type OrganizationImportResult,
} from '@lenseignement/types';
import { everywhereOrganizationIds, teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { organizations, type ORGANIZATION_TYPES } from '../db/schema.js';
import { assertManages, audit, createTeamInvitation, TeamError, teamPowers } from './team.js';

type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

const MAX_LINES = 500;
const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const deaccent = (value: string) => norm(value).normalize('NFD').replace(/[̀-ͯ]/g, '');

const TYPE_ALIASES: Record<string, OrganizationType> = {
  lycee: 'lycee',
  'secondaire public': 'lycee',
  'primaire prive': 'primary_private',
  'centre technique': 'technical_center',
  'centre de formation': 'technical_center',
  "centre d'alphabetisation": 'literacy_center',
  autorite: 'authority',
};

/** Accepte le code (« school »), un nom court (« école ») ou le libellé complet, sans accents ni casse. */
function parseType(raw: string): OrganizationType | null {
  const wanted = deaccent(raw).replace('’', "'");
  for (const [code, label] of Object.entries(ORGANIZATION_TYPE_LABELS)) {
    if (wanted === code || wanted === deaccent(label).replace('’', "'")) {
      return code as OrganizationType;
    }
  }
  return TYPE_ALIASES[wanted] ?? null;
}

/** Structures que la personne voit, avec leur parent, pour retrouver une structure par son nom. */
async function visibleOrganizations(db: Database, userId: string) {
  const { rows } = await db.execute(
    sql`select o.id, o.name, o.type, o.parent_id as "parentId" from organizations o
        where o.id in ${teamOrganizationIds(userId)} and o.archived_at is null`,
  );
  return rows as Array<{ id: string; name: string; type: string; parentId: string | null }>;
}

interface Sheet {
  name: string;
  type: OrganizationType;
  /** Direction régionale ; absente seulement pour créer une direction régionale. */
  parentId?: string | null;
  locality?: string;
  managerName?: string;
  managerContact?: string | null;
}

const MISSING = (what: string) => new TeamError('invalid', `${what} est obligatoire.`);

/**
 * Crée un établissement sous une direction régionale (DRENA), ou une direction régionale.
 * Superadministrateur et administrateur : partout. Gestionnaire : seulement sous une direction
 * régionale de sa zone. Le code d'invitation du responsable n'est donné que si la personne peut
 * nommer une direction (le superadministrateur).
 */
export async function createOrganization(
  db: Database,
  userId: string,
  input: Sheet,
  traceId?: string,
): Promise<CreatedOrganization> {
  const powers = await teamPowers(db, userId);
  if (!powers.canCreateOrganization) throw new TeamError('forbidden', 'Accès refusé.');
  const isDirection = input.type === 'authority';
  let parentId: string | null = null;
  if (isDirection) {
    if (!powers.everywhere) throw new TeamError('forbidden', 'Accès refusé.');
  } else {
    if (!input.parentId) throw MISSING('La direction régionale');
    await assertManages(db, userId, input.parentId);
    const { rows } = await db.execute(
      sql`select 1 from organizations where id = ${input.parentId} and type = 'authority' and archived_at is null`,
    );
    if (rows.length === 0) throw new TeamError('invalid', 'Choisissez une direction régionale.');
    parentId = input.parentId;
    if ((input.locality ?? '').length < 2) throw MISSING('La localité');
    if ((input.managerName ?? '').length < 2) throw MISSING('Le responsable');
  }
  const { rows: same } = await db.execute(
    sql`select 1 from organizations
        where lower(name) = lower(${input.name}) and parent_id is not distinct from ${parentId}
        limit 1`,
  );
  if (same.length > 0) {
    throw new TeamError('invalid', 'Un établissement porte déjà ce nom à cet endroit.');
  }
  const [created] = await db
    .insert(organizations)
    .values({
      name: input.name,
      type: input.type,
      parentId,
      locality: input.locality || null,
      managerName: input.managerName || null,
      managerContact: input.managerContact || null,
    })
    .returning({ id: organizations.id, name: organizations.name });
  if (!created) throw new TeamError('invalid', 'Création impossible.');
  await audit(db, userId, 'organization.create', created.id, traceId);
  const managerCode =
    !isDirection && powers.grantable.includes('chef-etablissement')
      ? (
          await createTeamInvitation(
            db,
            userId,
            { organizationId: created.id, role: 'chef-etablissement', branches: null },
            traceId,
          )
        ).code
      : null;
  return { ...created, managerCode };
}

/**
 * Import CSV (colonnes : nom officiel, type, direction régionale, localité, responsable, contact).
 * Sans `confirm`, simple aperçu ligne par ligne ; avec `confirm`, tout est créé d'un coup, ou rien
 * si une ligne est en erreur. Une ligne de type « autorité » crée une direction régionale.
 */
export async function importOrganizations(
  db: Database,
  userId: string,
  input: { csv: string; confirm: boolean },
  traceId?: string,
): Promise<OrganizationImportResult> {
  const powers = await teamPowers(db, userId);
  if (!powers.canCreateOrganization) throw new TeamError('forbidden', 'Accès refusé.');

  const table = parseCsv(input.csv);
  const header = (table[0] ?? []).map(deaccent);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const nameCol = col('nom officiel', 'nom', 'name');
  const typeCol = col('type');
  const directionCol = col('direction regionale', 'drena');
  const localityCol = col('localite', 'ville');
  const managerCol = col('responsable');
  const contactCol = col('contact', 'contact du responsable');
  if ([nameCol, typeCol, directionCol, localityCol, managerCol].some((c) => c < 0)) {
    throw new TeamError(
      'invalid',
      'La première ligne doit contenir les colonnes : nom officiel, type, direction régionale, localité, responsable (et facultativement : contact).',
    );
  }
  const body = table.slice(1);
  if (body.length === 0)
    throw new TeamError('invalid', 'Le fichier ne contient aucun établissement.');
  if (body.length > MAX_LINES) {
    throw new TeamError(
      'invalid',
      `Le fichier dépasse ${MAX_LINES} lignes : coupez-le en plusieurs.`,
    );
  }

  const existing = await visibleOrganizations(db, userId);
  // Doublon : même nom sous la même structure. On suit aussi ce que le fichier va créer.
  const taken = new Set(existing.map((o) => `${o.parentId ?? ''}|${norm(o.name)}`));
  // Directions régionales possibles : celles de la personne, puis celles que le fichier crée.
  const directions = new Map<string, string[]>();
  const addDirection = (name: string, key: string) =>
    directions.set(norm(name), [...(directions.get(norm(name)) ?? []), key]);
  for (const o of existing) if (o.type === 'authority') addDirection(o.name, o.id);

  const lines: OrganizationImportLine[] = [];
  const toCreate: Array<{
    key: string;
    name: string;
    type: OrganizationType;
    parentKey: string | null;
    locality: string | null;
    managerName: string | null;
    managerContact: string | null;
  }> = [];
  body.forEach((cells, index) => {
    const line = index + 2;
    const cell = (i: number) => (i < 0 ? '' : (cells[i] ?? '').trim().replace(/\s+/g, ' '));
    const name = cell(nameCol);
    const fail = (message: string) => lines.push({ line, name, status: 'error', message });
    if (name.length < 3 || name.length > 160)
      return fail('Le nom doit faire entre 3 et 160 caractères.');
    const type = parseType(cells[typeCol] ?? '');
    if (!type)
      return fail(
        'Type inconnu. Types possibles : primaire public, primaire privé, collège, lycée, secondaire privé, centre technique, centre d’alphabétisation, autorité, partenaire.',
      );
    let parentKey: string | null = null;
    if (type === 'authority') {
      if (!powers.everywhere) return fail('Vous ne pouvez pas créer une direction régionale.');
    } else {
      const direction = cell(directionCol);
      if (!direction) return fail('La direction régionale est obligatoire.');
      const found = directions.get(norm(direction)) ?? [];
      if (found.length === 0) return fail(`Direction régionale introuvable : « ${direction} ».`);
      if (found.length > 1) return fail(`Plusieurs directions s’appellent « ${direction} ».`);
      parentKey = found[0]!;
      if (cell(localityCol).length < 2) return fail('La localité est obligatoire.');
      if (cell(managerCol).length < 2) return fail('Le responsable est obligatoire.');
    }
    const key = `${parentKey ?? ''}|${norm(name)}`;
    if (taken.has(key)) {
      return lines.push({ line, name, status: 'exists', message: 'Existe déjà : ignoré.' });
    }
    taken.add(key);
    const tempKey = `new:${line}`;
    if (type === 'authority') addDirection(name, tempKey);
    toCreate.push({
      key: tempKey,
      name,
      type,
      parentKey,
      locality: cell(localityCol) || null,
      managerName: cell(managerCol) || null,
      managerContact: cell(contactCol) || null,
    });
    lines.push({ line, name, status: 'create', message: 'Sera créé.' });
  });

  const hasError = lines.some((l) => l.status === 'error');
  if (!input.confirm) return { lines, created: 0, confirmed: false };
  if (hasError) throw new TeamError('invalid', 'Corrigez les lignes en erreur avant de confirmer.');

  const real = new Map<string, string>(); // clé temporaire → identifiant réel
  await db.transaction(async (tx) => {
    for (const row of toCreate) {
      const parentId = row.parentKey
        ? row.parentKey.startsWith('new:')
          ? real.get(row.parentKey)!
          : row.parentKey
        : null;
      const [created] = await tx
        .insert(organizations)
        .values({
          name: row.name,
          type: row.type,
          parentId,
          locality: row.locality,
          managerName: row.managerName,
          managerContact: row.managerContact,
        })
        .returning({ id: organizations.id });
      real.set(row.key, created!.id);
    }
  });
  await audit(db, userId, `organization.import:${toCreate.length}`, 'import', traceId);
  return { lines, created: toCreate.length, confirmed: true };
}

// ---------------------------------------------------------------------------------------------
// Configuration des établissements : liste, fiche, modification, archivage.
// ---------------------------------------------------------------------------------------------

interface OrgRow {
  id: string;
  name: string;
  type: string;
  locality: string | null;
  manager_name: string | null;
  manager_contact: string | null;
  archived_at: Date | null;
  parent_id: string | null;
  parent_name: string | null;
}

const toItem = (r: OrgRow): OrganizationListItem => ({
  id: r.id,
  name: r.name,
  type: r.type,
  locality: r.locality,
  managerName: r.manager_name,
  managerContact: r.manager_contact,
  archivedAt: r.archived_at ? new Date(r.archived_at).toISOString() : null,
  direction: r.parent_id ? { id: r.parent_id, name: r.parent_name ?? '' } : null,
});

export interface OrganizationFilters {
  search?: string;
  directionId?: string;
  type?: string;
  archived?: boolean;
}

/** Structures que la personne gère, filtrées ; les archivées seulement sur demande. */
export async function listOrganizations(
  db: Database,
  userId: string,
  filters: OrganizationFilters,
): Promise<OrganizationListItem[]> {
  const powers = await teamPowers(db, userId);
  if (!powers.canCreateOrganization && !(await isManager(db, userId))) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  const like = filters.search ? `%${filters.search.replace(/[%_\\]/g, '')}%` : null;
  const { rows } = await db.execute(sql`
    select o.id, o.name, o.type, o.locality, o.manager_name, o.manager_contact, o.archived_at,
           o.parent_id, p.name as parent_name
      from organizations o
      left join organizations p on p.id = o.parent_id
     where o.id in ${teamOrganizationIds(userId)}
       and (${filters.archived ? sql`o.archived_at is not null` : sql`o.archived_at is null`})
       and (${like}::text is null or o.name ilike ${like} or o.locality ilike ${like}
            or o.manager_name ilike ${like})
       and (${filters.directionId ?? null}::uuid is null or o.parent_id = ${filters.directionId ?? null})
       and (${filters.type ?? null}::text is null or o.type = ${filters.type ?? null})
     order by o.name
     limit 300`);
  return (rows as unknown as OrgRow[]).map(toItem);
}

/** Dirige-t-elle une structure (direction ou gestionnaire) : accès en lecture à la configuration. */
async function isManager(db: Database, userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`select 1 from ${teamOrganizationIds(userId)} t limit 1`);
  return rows.length > 0;
}

async function rolesIn(db: Database, userId: string, organizationId: string) {
  const { rows } = await db.execute(sql`
    select distinct m.role from memberships m
     where m.user_id = ${userId} and (m.valid_until is null or m.valid_until > now())
       and m.organization_id in (
         with recursive up as (
           select ${organizationId}::uuid as id
           union select o.parent_id from organizations o join up on o.id = up.id
            where o.parent_id is not null)
         select id from up)`);
  return new Set(rows.map((r) => String((r as { role: string }).role)));
}

/** Ce que la personne peut faire sur une fiche, d'après ses rôles sur la structure et ses parents. */
async function powersOn(db: Database, userId: string, org: { id: string; type: string }) {
  const powers = await teamPowers(db, userId);
  await assertManages(db, userId, org.id);
  const here = await rolesIn(db, userId, org.id);
  const isDirection = org.type === 'authority';
  const manager = powers.everywhere || here.has('gestionnaire');
  // Sans le droit « établissements » (écran Droits), seule la direction modifie encore sa fiche.
  const can = powers.rights.has('etablissements');
  return {
    edit:
      (can && powers.everywhere) ||
      (!isDirection && ((can && here.has('gestionnaire')) || here.has('chef-etablissement'))),
    editStructure: can && powers.everywhere,
    archive: can && (powers.everywhere || (!isDirection && manager)),
  };
}

async function loadRow(db: Database, id: string): Promise<OrgRow> {
  const { rows } = await db.execute(sql`
    select o.id, o.name, o.type, o.locality, o.manager_name, o.manager_contact, o.archived_at,
           o.parent_id, p.name as parent_name
      from organizations o left join organizations p on p.id = o.parent_id
     where o.id = ${id}`);
  const row = rows[0] as unknown as OrgRow | undefined;
  if (!row) throw new TeamError('not_found', 'Établissement introuvable.');
  return row;
}

/**
 * L'établissement de la personne, pour l'en-tête de son espace : sa structure de rattachement
 * (un établissement plutôt qu'une direction régionale). Pour le superadministrateur et
 * l'administrateur, l'établissement de la plateforme quand il n'y en a qu'un.
 */
export async function myEstablishment(
  db: Database,
  userId: string,
): Promise<MyEstablishment | null> {
  const columns = sql`o.name, p.name as direction, o.locality`;
  const { rows } = await db.execute(sql`
    select ${columns}
      from memberships m
      join organizations o on o.id = m.organization_id
      left join organizations p on p.id = o.parent_id
     where m.user_id = ${userId} and (m.valid_until is null or m.valid_until > now())
       and not o.internal and o.archived_at is null
     order by (o.type = 'authority'), o.name
     limit 1`);
  if (rows.length > 0) return rows[0] as unknown as MyEstablishment;
  const { rows: only } = await db.execute(sql`
    select ${columns}
      from organizations o
      left join organizations p on p.id = o.parent_id
     where o.id in ${everywhereOrganizationIds(userId)}
       and o.type <> 'authority' and o.archived_at is null
     limit 2`);
  return only.length === 1 ? (only[0] as unknown as MyEstablishment) : null;
}

export async function getOrganization(
  db: Database,
  userId: string,
  id: string,
): Promise<OrganizationDetail> {
  const row = await loadRow(db, id).catch(() => {
    throw new TeamError('not_found', 'Établissement introuvable.');
  });
  const can = await powersOn(db, userId, row).catch(() => {
    throw new TeamError('not_found', 'Établissement introuvable.');
  });
  const { rows: counts } = await db.execute(sql`
    select (select count(*)::int from organizations c where c.parent_id = ${id} and c.archived_at is null) as children,
           (select count(*)::int from cohorts h where h.organization_id = ${id}) as cohorts`);
  const { rows: members } = await db.execute(sql`
    select u.display_name as "userName", m.role
      from memberships m join users u on u.id = m.user_id
     where m.organization_id = ${id} and (m.valid_until is null or m.valid_until > now())
       and m.role in ('chef-etablissement','gestionnaire','enseignant','alphabetiseur','referent-pedagogique','administrateur')
     order by m.role, u.display_name`);
  const c = counts[0] as unknown as { children: number; cohorts: number };
  return {
    ...toItem(row),
    activeChildren: c.children,
    cohortCount: c.cohorts,
    members: members as unknown as OrganizationDetail['members'],
    can,
  };
}

export async function updateOrganization(
  db: Database,
  userId: string,
  id: string,
  input: {
    name?: string;
    locality?: string;
    managerName?: string;
    managerContact?: string;
    type?: OrganizationType;
    parentId?: string;
  },
  traceId?: string,
): Promise<OrganizationDetail> {
  const row = await loadRow(db, id).catch(() => {
    throw new TeamError('not_found', 'Établissement introuvable.');
  });
  const can = await powersOn(db, userId, row).catch(() => {
    throw new TeamError('not_found', 'Établissement introuvable.');
  });
  if (!can.edit) throw new TeamError('forbidden', 'Accès refusé.');
  if ((input.type !== undefined || input.parentId !== undefined) && !can.editStructure) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  const type = input.type ?? (row.type as OrganizationType);
  let parentId = row.parent_id;
  if (input.parentId !== undefined) {
    if (type === 'authority')
      throw new TeamError('invalid', 'Une direction régionale n’a pas de direction.');
    const { rows } = await db.execute(
      sql`select 1 from organizations where id = ${input.parentId} and type = 'authority' and archived_at is null`,
    );
    if (rows.length === 0) throw new TeamError('invalid', 'Choisissez une direction régionale.');
    parentId = input.parentId;
  }
  if (type !== 'authority' && !parentId) throw MISSING('La direction régionale');
  if (type === 'authority' && row.type !== 'authority') {
    throw new TeamError('invalid', 'Un établissement ne devient pas une direction régionale.');
  }
  if (type !== 'authority' && row.type === 'authority') {
    throw new TeamError('invalid', 'Une direction régionale ne devient pas un établissement.');
  }
  const name = input.name ?? row.name;
  const { rows: same } = await db.execute(
    sql`select 1 from organizations
        where lower(name) = lower(${name}) and parent_id is not distinct from ${parentId}
          and id <> ${id} limit 1`,
  );
  if (same.length > 0)
    throw new TeamError('invalid', 'Un établissement porte déjà ce nom à cet endroit.');
  await db
    .update(organizations)
    .set({
      name,
      type,
      parentId,
      locality: input.locality ?? row.locality,
      managerName: input.managerName ?? row.manager_name,
      managerContact: input.managerContact ?? row.manager_contact,
    })
    .where(eq(organizations.id, id));
  await audit(db, userId, 'organization.update', id, traceId);
  return getOrganization(db, userId, id);
}

/** Archive ou rétablit. Une direction régionale ne s'archive pas tant qu'elle a des établissements actifs. */
export async function setOrganizationArchived(
  db: Database,
  userId: string,
  id: string,
  archived: boolean,
  traceId?: string,
): Promise<OrganizationDetail> {
  const detail = await getOrganization(db, userId, id);
  if (!detail.can.archive) throw new TeamError('forbidden', 'Accès refusé.');
  if (archived && detail.activeChildren > 0) {
    throw new TeamError(
      'invalid',
      `Archivez d’abord les ${detail.activeChildren} établissement(s) actifs de cette direction régionale.`,
    );
  }
  if (!archived && detail.direction) {
    const { rows } = await db.execute(
      sql`select 1 from organizations where id = ${detail.direction.id} and archived_at is null`,
    );
    if (rows.length === 0) {
      throw new TeamError('invalid', 'Rétablissez d’abord sa direction régionale.');
    }
  }
  await db
    .update(organizations)
    .set({ archivedAt: archived ? sql`now()` : null })
    .where(eq(organizations.id, id));
  await audit(db, userId, archived ? 'organization.archive' : 'organization.restore', id, traceId);
  return getOrganization(db, userId, id);
}
