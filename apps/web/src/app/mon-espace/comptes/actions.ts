'use server';

import type { AccountImportResult } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/comptes';

/** Suspend ou réactive un compte, puis revient à la même liste (mêmes filtres). */
export async function setAccountStatusAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? '');
  const back = String(form.get('back') ?? '');
  // Retour à la liste filtrée, sans l'ancien message.
  const path = back.startsWith(`${PATH}?`)
    ? back.replace(/&?(message|erreur)=[^&]*/g, '').replace(/\?$/, '')
    : PATH;
  const result = await apiSend(session.accessToken, 'POST', `/admin/accounts/${id}/status`, {
    status,
  });
  const separator = path.includes('?') ? '&' : '?';
  const notice = result.ok
    ? `message=${encodeURIComponent(status === 'suspended' ? 'Compte suspendu.' : 'Compte réactivé.')}`
    : `erreur=${encodeURIComponent(result.message ?? 'Changement impossible.')}`;
  redirect(`${path}${separator}${notice}`);
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** Retour à la liste filtrée (champ « back »), avec un message. */
function backTo(form: FormData, kind: 'message' | 'erreur', value: string): never {
  const back = text(form, 'back');
  const path = back.startsWith(`${PATH}?`)
    ? back.replace(/&?(message|erreur)=[^&]*/g, '').replace(/\?$/, '')
    : PATH;
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(value)}`);
}

async function accessToken(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

export async function updateAccountAction(form: FormData): Promise<void> {
  const level = text(form, 'level');
  const result = await apiSend(
    await accessToken(),
    'PATCH',
    `/admin/accounts/${text(form, 'id')}`,
    {
      displayName: text(form, 'displayName'),
      profiles: form.getAll('profiles').map(String),
      level: level || null,
    },
  );
  if (!result.ok) backTo(form, 'erreur', result.message ?? 'Modification impossible.');
  backTo(form, 'message', 'Compte modifié.');
}

export async function deleteAccountAction(form: FormData): Promise<void> {
  const result = await apiSend<{ removedFromKeycloak: boolean }>(
    await accessToken(),
    'DELETE',
    `/admin/accounts/${text(form, 'id')}`,
  );
  if (!result.ok) backTo(form, 'erreur', result.message ?? 'Suppression impossible.');
  backTo(
    form,
    'message',
    result.data.removedFromKeycloak
      ? 'Compte supprimé, ici et dans Keycloak.'
      : 'Compte supprimé ici. Keycloak n’étant pas encore réglé, supprimez-le aussi dans sa console.',
  );
}

export type ImportAccountsState = { result?: AccountImportResult; error?: string };

export async function importAccountsAction(
  _prev: ImportAccountsState,
  form: FormData,
): Promise<ImportAccountsState> {
  const file = form.get('file');
  const csv = file instanceof File && file.size > 0 ? await file.text() : '';
  if (!csv) return { error: 'Choisissez le tableau des comptes (.csv).' };
  const result = await apiSend<AccountImportResult>(
    await accessToken(),
    'POST',
    '/admin/accounts/import',
    { csv },
  );
  return result.ok ? { result: result.data } : { error: result.message ?? 'Import impossible.' };
}
