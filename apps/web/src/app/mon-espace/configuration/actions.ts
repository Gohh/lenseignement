'use server';

import {
  ESTABLISHMENT_CATEGORIES,
  establishmentFields,
  type CreatedOrganization,
  type EstablishmentCategory,
  type EstablishmentImportResult,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Actions serveur de la configuration : le navigateur n'a jamais le jeton, l'API décide des droits.

const PATH = '/mon-espace/configuration';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur' | 'code', value: string, path: string = PATH): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(value)}`);
}

export async function createOrganizationAction(form: FormData): Promise<void> {
  const result = await apiSend<CreatedOrganization>(await token(), 'POST', '/team/organizations', {
    name: text(form, 'name'),
    type: text(form, 'type'),
    parentId: text(form, 'parentId') || null,
    locality: text(form, 'locality'),
    managerName: text(form, 'managerName'),
    managerContact: text(form, 'managerContact'),
  });
  // En cas d'erreur, la fenêtre de création se rouvre.
  if (!result.ok) {
    const reopen = text(form, 'type') === 'authority' ? 'drena' : 'creer';
    back('erreur', result.message ?? 'Création impossible.', `${PATH}?ouvrir=${reopen}`);
  }
  // Le superadministrateur reçoit tout de suite le code d'invitation du responsable.
  if (result.data.managerCode) back('code', result.data.managerCode);
  if (text(form, 'type') === 'authority') {
    back('message', 'Direction régionale créée. Vous pouvez maintenant y rattacher des écoles.');
  }
  back('message', 'Établissement créé. Le superadministrateur donnera son code au responsable.');
}

export async function updateOrganizationAction(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const path = `${PATH}/etablissements/${id}`;
  const body: Record<string, string> = {
    name: text(form, 'name'),
    locality: text(form, 'locality'),
    managerName: text(form, 'managerName'),
    managerContact: text(form, 'managerContact'),
  };
  // Type et direction régionale : champs présents seulement pour qui peut les changer.
  if (form.has('type')) body.type = text(form, 'type');
  if (form.has('parentId') && text(form, 'parentId')) body.parentId = text(form, 'parentId');
  const result = await apiSend(await token(), 'PATCH', `/organizations/${id}`, body);
  if (!result.ok) back('erreur', result.message ?? 'Modification impossible.', path);
  back('message', 'Fiche enregistrée.', path);
}

/** Page de retour après « Retirer » : la liste (bouton de la ligne) ou la fiche. */
function afterRemoval(form: FormData): string {
  return text(form, 'retour') === 'liste' ? PATH : `${PATH}/etablissements/${text(form, 'id')}`;
}

export async function archiveOrganizationAction(form: FormData): Promise<void> {
  const path = afterRemoval(form);
  const result = await apiSend(await token(), 'POST', `/organizations/${text(form, 'id')}/archive`);
  if (!result.ok) back('erreur', result.message ?? 'Retrait impossible.', path);
  back(
    'message',
    `« ${text(form, 'name')} » est retiré de la liste active. Il reste dans « Archivés ».`,
    path,
  );
}

export async function restoreOrganizationAction(form: FormData): Promise<void> {
  const path = afterRemoval(form);
  const result = await apiSend(await token(), 'POST', `/organizations/${text(form, 'id')}/restore`);
  if (!result.ok) back('erreur', result.message ?? 'Rétablissement impossible.', path);
  back('message', 'Établissement rétabli dans la liste active.', path);
}

// Établissements des six catégories : formulaire, import contrôlé, « Mettre à jour ».

const categoryOf = (form: FormData): EstablishmentCategory | null => {
  const value = text(form, 'category');
  return (ESTABLISHMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as EstablishmentCategory)
    : null;
};

/** Saisie brute des champs de la catégorie ; les cases à cocher sont jointes par des virgules. */
function establishmentInput(form: FormData, category: EstablishmentCategory) {
  const fields: Record<string, string> = {};
  for (const field of establishmentFields(category)) {
    if (field.kind === 'direction') continue;
    fields[field.key] = joined(form, field.key);
  }
  return fields;
}

const joined = (form: FormData, name: string) =>
  form
    .getAll(name)
    .map((v) => String(v).trim())
    .filter((v) => v !== '')
    .join(', ');

export type FormState = { error: string } | null;

/** Création (formulaire) ou correction (« Modifier ») d'une fiche. */
export async function saveEstablishmentAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const category = categoryOf(form);
  if (!category) return { error: 'Choisissez le type d’établissement.' };
  const id = text(form, 'id');
  const fields = establishmentInput(form, category);
  const parentId = text(form, 'parentId');
  if (!id) {
    const result = await apiSend<CreatedOrganization>(
      await token(),
      'POST',
      '/organizations/establishments',
      { category, parentId, fields },
    );
    if (!result.ok) return { error: result.message ?? 'Création impossible.' };
    const path = `${PATH}/etablissements/${result.data.id}`;
    // Le superadministrateur reçoit tout de suite le code d'invitation du responsable.
    if (result.data.managerCode) back('code', result.data.managerCode, path);
    back('message', 'Établissement enregistré.', path);
  }
  // Catégorie et DRENA : envoyées seulement par qui peut les changer.
  const body: Record<string, unknown> = { fields };
  if (form.has('structure')) Object.assign(body, { category, parentId });
  const result = await apiSend(await token(), 'PUT', `/organizations/${id}/fiche`, body);
  if (!result.ok) return { error: result.message ?? 'Modification impossible.' };
  back('message', 'Fiche corrigée.', `${PATH}/etablissements/${id}`);
}

export type EstablishmentImportState =
  (EstablishmentImportResult & { csv: string }) | { error: string } | null;

/** Contrôle du fichier, puis enregistrement si la personne confirme (même fichier gardé). */
export async function importEstablishmentsAction(
  _previous: EstablishmentImportState,
  form: FormData,
): Promise<EstablishmentImportState> {
  const category = categoryOf(form);
  if (!category) return { error: 'Choisissez le type d’établissement.' };
  // Après le contrôle, React vide le champ fichier : la confirmation reprend le texte gardé.
  const file = form.get('file');
  const csv =
    file instanceof File && file.size > 0 ? await file.text() : String(form.get('csv') ?? '');
  if (!csv.trim()) return { error: 'Choisissez un fichier.' };
  const result = await apiSend<EstablishmentImportResult>(
    await token(),
    'POST',
    '/organizations/establishments/import',
    { category, csv, confirm: form.get('confirm') === '1' },
  );
  return result.ok ? { ...result.data, csv } : { error: result.message ?? 'Import impossible.' };
}

/** « Mettre à jour » : un changement réel, daté, gardé dans l'historique de la fiche. */
export async function establishmentChangeAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const id = text(form, 'id');
  const result = await apiSend(await token(), 'POST', `/organizations/${id}/changes`, {
    field: text(form, 'field'),
    value: joined(form, 'value'),
    effectiveOn: text(form, 'effectiveOn'),
    note: text(form, 'note') || undefined,
  });
  if (!result.ok) return { error: result.message ?? 'Mise à jour impossible.' };
  back('message', 'Mise à jour enregistrée dans l’historique.', `${PATH}/etablissements/${id}`);
}

// Classes d'un établissement : création, enseignants, code de classe, archivage.

const orgPath = (form: FormData) => `${PATH}/etablissements/${text(form, 'organizationId')}`;

export async function createCohortAction(form: FormData): Promise<void> {
  const path = orgPath(form);
  const result = await apiSend(await token(), 'POST', '/cohorts', {
    organizationId: text(form, 'organizationId'),
    level: text(form, 'level'),
    name: text(form, 'name'),
    schoolYear: text(form, 'schoolYear'),
  });
  // En cas d'erreur, la fenêtre de création se rouvre.
  if (!result.ok) back('erreur', result.message ?? 'Création impossible.', `${path}?ouvrir=classe`);
  back('message', 'Classe créée. Donnez son code aux élèves.', path);
}

export async function addCohortTeacherAction(form: FormData): Promise<void> {
  const path = orgPath(form);
  const result = await apiSend(
    await token(),
    'POST',
    `/cohorts/${text(form, 'cohortId')}/teachers`,
    {
      userId: text(form, 'userId'),
    },
  );
  if (!result.ok) back('erreur', result.message ?? 'Affectation impossible.', path);
  back('message', 'Enseignant affecté à la classe.', path);
}

export async function removeCohortTeacherAction(form: FormData): Promise<void> {
  const path = orgPath(form);
  const result = await apiSend(
    await token(),
    'DELETE',
    `/cohorts/${text(form, 'cohortId')}/teachers/${text(form, 'userId')}`,
  );
  if (!result.ok) back('erreur', result.message ?? 'Retrait impossible.', path);
  back('message', 'Enseignant retiré de la classe.', path);
}

export async function renewCohortCodeAction(form: FormData): Promise<void> {
  const path = orgPath(form);
  const result = await apiSend(await token(), 'POST', `/cohorts/${text(form, 'cohortId')}/code`);
  if (!result.ok) back('erreur', result.message ?? 'Changement impossible.', path);
  back('message', 'Nouveau code de classe créé. L’ancien ne marche plus.', path);
}

export async function archiveCohortAction(form: FormData): Promise<void> {
  const path = orgPath(form);
  const result = await apiSend(await token(), 'POST', `/cohorts/${text(form, 'cohortId')}/archive`);
  if (!result.ok) back('erreur', result.message ?? 'Archivage impossible.', path);
  back('message', 'Classe archivée.', path);
}

export async function restoreCohortAction(form: FormData): Promise<void> {
  const path = orgPath(form);
  const result = await apiSend(await token(), 'POST', `/cohorts/${text(form, 'cohortId')}/restore`);
  if (!result.ok) back('erreur', result.message ?? 'Rétablissement impossible.', path);
  back('message', 'Classe rétablie.', path);
}
