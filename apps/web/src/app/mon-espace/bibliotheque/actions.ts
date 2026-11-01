'use server';

import type { AddResourceInput } from '@lenseignement/types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/bibliotheque';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur', value: string): never {
  redirect(`${PATH}?${kind}=${encodeURIComponent(value)}`);
}

/**
 * Crée la fiche du livre (titre, étagère, couverture…). Pour un fichier, la fenêtre envoie
 * ensuite le fichier ; le livre n'apparaît aux élèves qu'une fois le fichier reçu.
 */
export async function createBookAction(
  cohortId: string,
  input: Partial<AddResourceInput>,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const result = await apiSend<{ id: string }>(
    await token(),
    'POST',
    `/cohorts/${encodeURIComponent(cohortId)}/resources`,
    input,
  );
  return result.ok
    ? { ok: true, id: result.data.id }
    : { ok: false, message: result.message ?? 'Ajout impossible.' };
}

/** Retire un livre resté incomplet (envoi du fichier interrompu). */
export async function cancelBookAction(id: string): Promise<void> {
  await apiSend(await token(), 'DELETE', `/resources/${encodeURIComponent(id)}`);
}

export async function bookAddedAction(): Promise<void> {
  revalidatePath(PATH);
  back('message', 'Livre ajouté. Les élèves de la classe le voient sur l’étagère.');
}

export async function removeResourceAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'DELETE', `/resources/${text(form, 'id')}`);
  if (!result.ok) back('erreur', result.message ?? 'Retrait impossible.');
  back('message', 'Livre retiré de la bibliothèque.');
}
