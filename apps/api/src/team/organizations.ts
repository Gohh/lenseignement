import { sql } from 'drizzle-orm';
import {
  ORGANIZATION_TYPE_LABELS,
  type OrganizationImportLine,
  type OrganizationImportResult,
} from '@lenseignement/types';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database } from '../db/database.js';
import { organizations, type ORGANIZATION_TYPES } from '../db/schema.js';
import { assertManages, audit, TeamError, teamPowers } from './team.js';

type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

const MAX_LINES = 500;
const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const deaccent = (value: string) => norm(value).normalize('NFD').replace(/[̀-ͯ]/g, '');

const TYPE_ALIASES: Record<string, OrganizationType> = {
  ecole: 'school',
  etablissement: 'school',
  'centre technique': 'technical_center',
  'centre de formation': 'technical_center',
  'centre d’alphabétisation': 'literacy_center',
  "centre d'alphabetisation": 'literacy_center',
  autorite: 'authority',
  partenaire: 'partner',
};

/** Accepte le code (« school »), un nom court (« école ») ou le libellé complet, sans accents ni casse. */
function parseType(raw: string): OrganizationType | null {
  const wanted = deaccent(raw).replace('’', "'");
  for (const [code, label] of Object.entries(ORGANIZATION_TYPE_LABELS)) {
    if (wanted === code || wanted === deaccent(label).replace('’', "'")) {
      return code as OrganizationType;
    }
  }
  const alias = Object.entries(TYPE_ALIASES).find(
    ([key]) => deaccent(key).replace('’', "'") === wanted,
  );
  return alias ? alias[1] : null;
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
    sql`select o.id, o.name, o.parent_id as "parentId" from organizations o
        where o.id in ${teamOrganizationIds(userId)}`,
  );
  return rows as Array<{ id: string; name: string; parentId: string | null }>;
}

/**
 * Crée un établissement. Superadministrateur et administrateur : partout. Gestionnaire : seulement
 * sous une structure de sa zone, qu'il doit donc indiquer.
 */
export async function createOrganization(
  db: Database,
  userId: string,
  input: { name: string; type: OrganizationType; parentId?: string | null },
  traceId?: string,
): Promise<{ id: string; name: string }> {
  const powers = await teamPowers(db, userId);
  if (!powers.canCreateOrganization) throw new TeamError('forbidden', 'Accès refusé.');
  const parentId = input.parentId ?? null;
  if (parentId) await assertManages(db, userId, parentId);
  else if (!powers.everywhere) {
    throw new TeamError('invalid', 'Indiquez la structure dont dépend l’établissement.');
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
    .values({ name: input.name, type: input.type, parentId })
    .returning({ id: organizations.id, name: organizations.name });
  if (!created) throw new TeamError('invalid', 'Création impossible.');
  await audit(db, userId, 'organization.create', created.id, traceId);
  return created;
}

/**
 * Import CSV (colonnes : nom, type, structure parente). Sans `confirm`, simple aperçu ligne par
 * ligne ; avec `confirm`, tout est créé d'un coup, ou rien si une ligne est en erreur.
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
  const nameCol = col('nom', 'name');
  const typeCol = col('type');
  const parentCol = col('structure parente', 'parent', 'structure');
  if (nameCol < 0 || typeCol < 0) {
    throw new TeamError(
      'invalid',
      'La première ligne doit contenir les colonnes : nom, type, structure parente.',
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
  const byName = new Map<string, Array<{ id: string | null; tempKey: string }>>();
  for (const o of existing) {
    const list = byName.get(norm(o.name)) ?? [];
    list.push({ id: o.id, tempKey: o.id });
    byName.set(norm(o.name), list);
  }

  const lines: OrganizationImportLine[] = [];
  const toCreate: Array<{
    key: string;
    name: string;
    type: OrganizationType;
    parentKey: string | null;
  }> = [];
  body.forEach((cells, index) => {
    const line = index + 2;
    const name = (cells[nameCol] ?? '').trim().replace(/\s+/g, ' ');
    const fail = (message: string) => lines.push({ line, name, status: 'error', message });
    if (name.length < 3 || name.length > 160)
      return fail('Le nom doit faire entre 3 et 160 caractères.');
    const type = parseType(cells[typeCol] ?? '');
    if (!type)
      return fail(
        'Type inconnu. Types possibles : école, centre technique, centre d’alphabétisation, autorité, partenaire.',
      );
    const parentName = parentCol >= 0 ? (cells[parentCol] ?? '').trim() : '';
    let parentKey: string | null = null;
    if (parentName) {
      const found = byName.get(norm(parentName)) ?? [];
      if (found.length === 0) return fail(`Structure parente introuvable : « ${parentName} ».`);
      if (found.length > 1) return fail(`Plusieurs structures s’appellent « ${parentName} ».`);
      parentKey = found[0]!.tempKey;
    } else if (!powers.everywhere) {
      return fail('La structure parente est obligatoire.');
    }
    const key = `${parentKey ?? ''}|${norm(name)}`;
    if (taken.has(key)) {
      return lines.push({ line, name, status: 'exists', message: 'Existe déjà : ignoré.' });
    }
    taken.add(key);
    const tempKey = `new:${line}`;
    const list = byName.get(norm(name)) ?? [];
    list.push({ id: null, tempKey });
    byName.set(norm(name), list);
    toCreate.push({ key: tempKey, name, type, parentKey });
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
        .values({ name: row.name, type: row.type, parentId })
        .returning({ id: organizations.id });
      real.set(row.key, created!.id);
    }
  });
  await audit(db, userId, `organization.import:${toCreate.length}`, 'import', traceId);
  return { lines, created: toCreate.length, confirmed: true };
}
