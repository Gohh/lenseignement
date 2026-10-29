import { sql } from 'drizzle-orm';
import {
  ORGANIZATION_TYPE_LABELS,
  type CreatedOrganization,
  type OrganizationImportLine,
  type OrganizationImportResult,
} from '@lenseignement/types';
import { teamOrganizationIds } from '../access/access.service.js';
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

/** Lit un CSV (séparateur « ; » ou « , », guillemets, BOM) et renvoie les lignes de champs. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const separator =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Structures que la personne voit, avec leur parent, pour retrouver une structure par son nom. */
async function visibleOrganizations(db: Database, userId: string) {
  const { rows } = await db.execute(
    sql`select o.id, o.name, o.type, o.parent_id as "parentId" from organizations o
        where o.id in ${teamOrganizationIds(userId)}`,
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
      sql`select 1 from organizations where id = ${input.parentId} and type = 'authority'`,
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
