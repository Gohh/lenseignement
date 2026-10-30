import { eq, sql } from 'drizzle-orm';
import {
  checkEstablishment,
  checkEstablishmentField,
  ESTABLISHMENT_COLUMN_KEYS,
  establishmentFields,
  establishmentValue,
  fieldForHeader,
  formatEstablishmentValue,
  parseCsv,
  type CreatedOrganization,
  type EstablishmentCategory,
  type EstablishmentField,
  type EstablishmentFieldError,
  type EstablishmentImportAnomaly,
  type EstablishmentImportResult,
  type EstablishmentValue,
  type OrganizationDetail,
} from '@lenseignement/types';
import { teamOrganizationIds } from '../access/access.service.js';
import type { Database, Executor } from '../db/database.js';
import { organizationChanges, organizations } from '../db/schema.js';
import { getOrganization, loadRow, powersOn } from './organizations.js';
import { assertManages, audit, createTeamInvitation, TeamError, teamPowers } from './team.js';

/**
 * Établissements des six catégories : création par formulaire, import contrôlé, correction de
 * la fiche (« Modifier ») et changement daté avec historique (« Mettre à jour »).
 */

const MAX_LINES = 500;
const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** Colonnes de la table pour les valeurs contrôlées ; le reste va dans `details`. */
function toColumns(category: EstablishmentCategory, values: Record<string, EstablishmentValue>) {
  const details: Record<string, EstablishmentValue> = {};
  for (const field of establishmentFields(category)) {
    const isColumn = (ESTABLISHMENT_COLUMN_KEYS as readonly string[]).includes(field.key);
    if (!isColumn && values[field.key] !== undefined) details[field.key] = values[field.key]!;
  }
  const text = (key: string) => (values[key] as string | undefined) ?? null;
  return {
    name: values.name as string,
    officialCode: text('officialCode'),
    status: text('status'),
    locality: text('locality'),
    municipality: text('municipality'),
    managerName: text('managerName'),
    phone: text('phone'),
    email: text('email'),
    openedYear: (values.openedYear as number | undefined) ?? null,
    details,
  };
}

const describe = (errors: EstablishmentFieldError[]) =>
  errors.map((e) => `${e.label} : ${e.message}`).join(' ');

/** Une DRENA active dans le champ de la personne. */
async function assertDirection(db: Database, userId: string, parentId: string): Promise<string> {
  await assertManages(db, userId, parentId).catch(() => {
    throw new TeamError('invalid', 'Choisissez une DRENA de votre zone.');
  });
  const { rows } = await db.execute<{ name: string }>(
    sql`select name from organizations where id = ${parentId} and type = 'authority' and archived_at is null`,
  );
  if (rows.length === 0) throw new TeamError('invalid', 'Choisissez une DRENA.');
  return rows[0]!.name;
}

/** Même code officiel, ou même nom dans la même DRENA, ailleurs que sur `exceptId`. */
async function assertNoDuplicate(
  db: Executor,
  input: { name: string; officialCode: string | null; parentId: string },
  exceptId: string | null,
) {
  if (input.officialCode) {
    const { rows } = await db.execute(
      sql`select 1 from organizations where lower(official_code) = lower(${input.officialCode})
          and id is distinct from ${exceptId}::uuid limit 1`,
    );
    if (rows.length > 0) {
      throw new TeamError('invalid', `Le code officiel ${input.officialCode} est déjà utilisé.`);
    }
  }
  const { rows } = await db.execute(
    sql`select 1 from organizations where lower(name) = lower(${input.name})
        and parent_id = ${input.parentId} and id is distinct from ${exceptId}::uuid limit 1`,
  );
  if (rows.length > 0) {
    throw new TeamError('invalid', 'Un établissement porte déjà ce nom dans cette DRENA.');
  }
}

export async function createEstablishment(
  db: Database,
  userId: string,
  input: { category: EstablishmentCategory; parentId: string; fields: Record<string, string> },
  traceId?: string,
): Promise<CreatedOrganization> {
  const powers = await teamPowers(db, userId);
  if (!powers.canCreateOrganization) throw new TeamError('forbidden', 'Accès refusé.');
  const direction = await assertDirection(db, userId, input.parentId);
  const { values, errors } = checkEstablishment(input.category, {
    ...input.fields,
    direction,
  });
  if (errors.length > 0) throw new TeamError('invalid', describe(errors));
  const columns = toColumns(input.category, values);
  await assertNoDuplicate(db, { ...columns, parentId: input.parentId }, null);
  const [created] = await db
    .insert(organizations)
    .values({ ...columns, type: input.category, parentId: input.parentId })
    .returning({ id: organizations.id, name: organizations.name });
  await audit(db, userId, 'organization.create', created!.id, traceId);
  // Comme avant : qui peut nommer une direction reçoit tout de suite le code du responsable.
  const managerCode = powers.grantable.includes('chef-etablissement')
    ? (
        await createTeamInvitation(
          db,
          userId,
          { organizationId: created!.id, role: 'chef-etablissement', branches: null },
          traceId,
        )
      ).code
    : null;
  return { id: created!.id, name: created!.name, managerCode };
}

/**
 * Import d'une catégorie : structure du fichier, champs obligatoires, validité, doublons (dans
 * le fichier et avec la base). Rien n'est créé tant qu'il reste une anomalie ; les lignes déjà
 * enregistrées sont signalées et ignorées.
 */
export async function importEstablishments(
  db: Database,
  userId: string,
  input: { category: EstablishmentCategory; csv: string; confirm: boolean },
  traceId?: string,
): Promise<EstablishmentImportResult> {
  if (!(await teamPowers(db, userId)).canCreateOrganization) {
    throw new TeamError('forbidden', 'Accès refusé.');
  }
  const { category } = input;
  const result: EstablishmentImportResult = {
    category,
    total: 0,
    ready: 0,
    duplicates: [],
    anomalies: [],
    created: 0,
    confirmed: false,
  };
  const anomaly = (a: EstablishmentImportAnomaly) => result.anomalies.push(a);
  const table = parseCsv(input.csv);
  if (table.length === 0) {
    anomaly({ line: 0, column: '', value: '', message: 'Le fichier est vide.' });
    return result;
  }

  // 1. Structure : les colonnes du modèle de la catégorie.
  const columns: Array<EstablishmentField | null> = table[0]!.map((header) => {
    const label = header.replace(/\*/g, '').trim();
    if (label === '') return null;
    const field = fieldForHeader(category, label);
    if (!field) {
      anomaly({
        line: 1,
        column: label,
        value: '',
        message: 'Colonne inconnue pour cette catégorie : retirez-la ou repartez du modèle.',
      });
    }
    return field;
  });
  const seenColumns = new Set<string>();
  for (const field of columns) {
    if (!field) continue;
    if (seenColumns.has(field.key)) {
      anomaly({ line: 1, column: field.label, value: '', message: 'Colonne en double.' });
    }
    seenColumns.add(field.key);
  }
  for (const field of establishmentFields(category)) {
    if (field.required && !seenColumns.has(field.key)) {
      anomaly({ line: 1, column: field.label, value: '', message: 'Colonne obligatoire absente.' });
    }
  }
  const body = table.slice(1);
  result.total = body.length;
  if (body.length === 0) {
    anomaly({ line: 0, column: '', value: '', message: 'Le fichier ne contient aucune ligne.' });
  }
  if (body.length > MAX_LINES) {
    anomaly({
      line: 0,
      column: '',
      value: String(body.length),
      message: `Le fichier dépasse ${MAX_LINES} lignes : coupez-le en plusieurs.`,
    });
  }
  if (result.anomalies.length > 0) return result;

  // DRENA de la zone de la personne, codes et noms déjà enregistrés.
  const { rows: visible } = await db.execute<{
    id: string;
    name: string;
    type: string;
    parentId: string | null;
  }>(sql`select o.id, o.name, o.type, o.parent_id as "parentId" from organizations o
         where o.id in ${teamOrganizationIds(userId)} and o.archived_at is null`);
  const directions = new Map<string, string[]>();
  for (const o of visible) {
    if (o.type === 'authority')
      directions.set(norm(o.name), [...(directions.get(norm(o.name)) ?? []), o.id]);
  }
  const { rows: known } = await db.execute<{
    name: string;
    parentId: string | null;
    code: string | null;
  }>(sql`select name, parent_id as "parentId", lower(official_code) as code from organizations`);
  const takenNames = new Set(known.map((o) => `${o.parentId ?? ''}|${norm(o.name)}`));
  const takenCodes = new Set(known.filter((o) => o.code).map((o) => o.code!));

  const fileNames = new Map<string, number>();
  const fileCodes = new Map<string, number>();
  const toCreate: Array<ReturnType<typeof toColumns> & { parentId: string }> = [];
  body.forEach((cells, index) => {
    const line = index + 2;
    const raw: Record<string, string> = {};
    columns.forEach((field, i) => {
      if (field) raw[field.key] = (cells[i] ?? '').trim();
    });
    const before = result.anomalies.length;
    const { values, errors } = checkEstablishment(category, raw);
    for (const e of errors) anomaly({ line, column: e.label, value: e.value, message: e.message });

    let parentId: string | null = null;
    const directionName = raw.direction ?? '';
    if (directionName) {
      const found = directions.get(norm(directionName)) ?? [];
      if (found.length === 0) {
        anomaly({
          line,
          column: 'DRENA',
          value: directionName,
          message: 'DRENA introuvable, ou hors de votre zone. Écrivez son nom exact.',
        });
      } else if (found.length > 1) {
        anomaly({
          line,
          column: 'DRENA',
          value: directionName,
          message: 'Plusieurs DRENA portent ce nom.',
        });
      } else parentId = found[0]!;
    }
    if (result.anomalies.length > before || !parentId) return;

    const row = { ...toColumns(category, values), parentId };
    const nameKey = `${parentId}|${norm(row.name)}`;
    const code = row.officialCode?.toLowerCase() ?? null;
    if (code && fileCodes.has(code)) {
      return anomaly({
        line,
        column: 'Code officiel',
        value: row.officialCode!,
        message: `Même code qu’à la ligne ${fileCodes.get(code)} du fichier.`,
      });
    }
    if (fileNames.has(nameKey)) {
      return anomaly({
        line,
        column: 'Nom officiel',
        value: row.name,
        message: `Même nom et même DRENA qu’à la ligne ${fileNames.get(nameKey)} du fichier.`,
      });
    }
    if (code) fileCodes.set(code, line);
    fileNames.set(nameKey, line);
    if ((code && takenCodes.has(code)) || takenNames.has(nameKey)) {
      result.duplicates.push({
        line,
        name: row.name,
        message:
          code && takenCodes.has(code)
            ? `Déjà enregistré (code ${row.officialCode}) : ignoré.`
            : 'Déjà enregistré dans cette DRENA : ignoré.',
      });
      return;
    }
    toCreate.push(row);
  });
  result.ready = result.anomalies.length > 0 ? 0 : toCreate.length;
  if (!input.confirm) return result;
  if (result.anomalies.length > 0) {
    throw new TeamError('invalid', 'Corrigez les anomalies avant de confirmer l’import.');
  }
  await db.transaction(async (tx) => {
    for (const row of toCreate) await tx.insert(organizations).values({ ...row, type: category });
  });
  await audit(db, userId, `organization.import:${toCreate.length}`, 'import', traceId);
  return { ...result, created: toCreate.length, confirmed: true };
}

async function loadEditable(db: Database, userId: string, id: string) {
  const row = await loadRow(db, id).catch(() => {
    throw new TeamError('not_found', 'Établissement introuvable.');
  });
  const can = await powersOn(db, userId, row).catch(() => {
    throw new TeamError('not_found', 'Établissement introuvable.');
  });
  if (!can.edit) throw new TeamError('forbidden', 'Accès refusé.');
  if (row.type === 'authority' || row.type === 'partner') {
    throw new TeamError('invalid', 'Cette structure n’est pas un établissement.');
  }
  return { row, can, category: row.type as EstablishmentCategory };
}

/** « Modifier » : corrige la fiche entière ; aucune trace dans l'historique de la fiche. */
export async function updateEstablishment(
  db: Database,
  userId: string,
  id: string,
  input: { fields: Record<string, string>; category?: EstablishmentCategory; parentId?: string },
  traceId?: string,
): Promise<OrganizationDetail> {
  const { row, can, category: current } = await loadEditable(db, userId, id);
  const structureChange =
    (input.category !== undefined && input.category !== current) ||
    (input.parentId !== undefined && input.parentId !== row.parent_id);
  if (structureChange && !can.editStructure) throw new TeamError('forbidden', 'Accès refusé.');
  const category = input.category ?? current;
  const parentId = input.parentId ?? row.parent_id;
  if (!parentId) throw new TeamError('invalid', 'Choisissez une DRENA.');
  const direction =
    parentId === row.parent_id
      ? (row.parent_name ?? '')
      : await assertDirection(db, userId, parentId);
  const { values, errors } = checkEstablishment(category, { ...input.fields, direction });
  if (errors.length > 0) throw new TeamError('invalid', describe(errors));
  const columns = toColumns(category, values);
  await assertNoDuplicate(db, { ...columns, parentId }, id);
  await db
    .update(organizations)
    .set({ ...columns, type: category, parentId })
    .where(eq(organizations.id, id));
  await audit(db, userId, 'organization.update', id, traceId);
  return getOrganization(db, userId, id);
}

/** « Mettre à jour » : un changement réel, daté ; l'ancienne valeur reste dans l'historique. */
export async function addEstablishmentChange(
  db: Database,
  userId: string,
  id: string,
  input: { field: string; value: string; effectiveOn: string; note?: string },
  traceId?: string,
  today = new Date(),
): Promise<OrganizationDetail> {
  const { category } = await loadEditable(db, userId, id);
  const field = establishmentFields(category).find((f) => f.key === input.field && f.evolves);
  if (!field)
    throw new TeamError('invalid', 'Ce champ ne se met pas à jour : utilisez « Modifier ».');
  if (input.effectiveOn > today.toISOString().slice(0, 10)) {
    throw new TeamError('invalid', 'La date du changement ne peut pas être dans le futur.');
  }
  const checked = checkEstablishmentField(field, input.value);
  if ('error' in checked) throw new TeamError('invalid', `${field.label} : ${checked.error}`);
  const before = await getOrganization(db, userId, id);
  const oldValue = formatEstablishmentValue(field, establishmentValue(before, field.key));
  const newValue = formatEstablishmentValue(field, checked.value);
  if (oldValue === newValue) throw new TeamError('invalid', 'La valeur n’a pas changé.');

  const isColumn = (ESTABLISHMENT_COLUMN_KEYS as readonly string[]).includes(field.key);
  await db.transaction(async (tx) => {
    if (isColumn) {
      await tx
        .update(organizations)
        .set({ [field.key]: checked.value })
        .where(eq(organizations.id, id));
    } else {
      const details = { ...before.details };
      if (checked.value === null) delete details[field.key];
      else details[field.key] = checked.value;
      await tx.update(organizations).set({ details }).where(eq(organizations.id, id));
    }
    await tx.insert(organizationChanges).values({
      organizationId: id,
      field: field.key,
      oldValue,
      newValue,
      effectiveOn: input.effectiveOn,
      note: input.note || null,
      changedBy: userId,
    });
  });
  await audit(db, userId, 'organization.change', id, traceId);
  return getOrganization(db, userId, id);
}
