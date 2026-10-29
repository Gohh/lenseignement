'use server';

import {
  type CreatedOrganization,
  type OrganizationImportLine,
  type OrganizationImportResult,
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
  redirect(`${path}?${kind}=${encodeURIComponent(value)}`);
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
  if (!result.ok) back('erreur', result.message ?? 'Création impossible.');
  // Le superadministrateur reçoit tout de suite le code d'invitation du responsable.
  if (result.data.managerCode) back('code', result.data.managerCode);
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

export async function archiveOrganizationAction(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const path = `${PATH}/etablissements/${id}`;
  const result = await apiSend(await token(), 'POST', `/organizations/${id}/archive`);
  if (!result.ok) back('erreur', result.message ?? 'Archivage impossible.', path);
  back('message', 'Établissement archivé : il n’apparaît plus dans les listes.', path);
}

export async function restoreOrganizationAction(form: FormData): Promise<void> {
  const id = text(form, 'id');
  const path = `${PATH}/etablissements/${id}`;
  const result = await apiSend(await token(), 'POST', `/organizations/${id}/restore`);
  if (!result.ok) back('erreur', result.message ?? 'Rétablissement impossible.', path);
  back('message', 'Établissement rétabli.', path);
}

export type ImportState =
  | { lines: OrganizationImportLine[]; created: number; confirmed: boolean; csv: string }
  | { error: string }
  | null;

/** Aperçu du fichier, puis création si la personne a confirmé (même fichier, second bouton). */
export async function importOrganizationsAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  // Après l'aperçu, React vide le champ fichier : la confirmation reprend le texte gardé.
  const file = form.get('file');
  const csv =
    file instanceof File && file.size > 0 ? await file.text() : String(form.get('csv') ?? '');
  if (!csv.trim()) return { error: 'Choisissez un fichier CSV.' };
  const result = await apiSend<OrganizationImportResult>(
    await token(),
    'POST',
    '/team/organizations/import',
    { csv, confirm: form.get('confirm') === '1' },
  );
  return result.ok ? { ...result.data, csv } : { error: result.message ?? 'Import impossible.' };
}
