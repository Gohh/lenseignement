'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Rédaction des ateliers : le navigateur n'a jamais le jeton, et l'API décide des droits.

const ID = /^[0-9a-f-]{36}$/i;
const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

async function token(returnTo: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session.accessToken;
}

function back(path: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}`);
}

function idOf(form: FormData): string {
  const id = text(form, 'id');
  if (!ID.test(id)) redirect('/mon-espace/ateliers');
  return id;
}

export async function createWorkshopAction(form: FormData): Promise<void> {
  const path = '/mon-espace/ateliers/nouveau';
  const result = await apiSend<{ id: string }>(await token(path), 'POST', '/authoring/workshops', {
    organizationId: text(form, 'organizationId'),
    trade: text(form, 'trade'),
    title: text(form, 'title'),
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Création impossible.');
  back(`/mon-espace/ateliers/${result.data.id}`, 'message', 'Atelier créé. Ajoutez ses étapes.');
}

/** Enregistre tout le brouillon : la fiche et les étapes arrivent en JSON (champ `payload`). */
export async function saveWorkshopAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `/mon-espace/ateliers/${id}`;
  let payload: unknown;
  try {
    payload = JSON.parse(text(form, 'payload'));
  } catch {
    back(path, 'erreur', 'Formulaire illisible : réessayez.');
  }
  const result = await apiSend(await token(path), 'PUT', `/authoring/workshops/${id}`, payload);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Enregistrement impossible.');
  back(path, 'message', 'Brouillon enregistré.');
}

const STEPS: Record<string, { path: string; done: string; method?: 'POST' | 'DELETE' }> = {
  submit: { path: 'submit', done: 'Envoyé en relecture.' },
  publish: {
    path: 'publish',
    done: 'Atelier publié : les élèves le trouvent dans leur catalogue.',
  },
  reopen: { path: 'reopen', done: 'Brouillon ouvert. La version en ligne reste visible.' },
  archive: { path: 'archive', done: 'Atelier retiré du catalogue.' },
  restore: { path: 'restore', done: 'Atelier remis en ligne.' },
};

export async function workshopStepAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `/mon-espace/ateliers/${id}`;
  const step = STEPS[text(form, 'step')];
  if (!step) redirect(path);
  const result = await apiSend(
    await token(path),
    'POST',
    `/authoring/workshops/${id}/${step.path}`,
    {},
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Action impossible.');
  back(path, 'message', step.done);
}

export async function returnWorkshopAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `/mon-espace/ateliers/${id}`;
  const result = await apiSend(await token(path), 'POST', `/authoring/workshops/${id}/return`, {
    note: text(form, 'note'),
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Action impossible.');
  back(path, 'message', 'Atelier renvoyé à son auteur avec votre remarque.');
}

export async function deleteWorkshopAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `/mon-espace/ateliers/${id}`;
  const result = await apiSend(await token(path), 'DELETE', `/authoring/workshops/${id}`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Suppression impossible.');
  back('/mon-espace/ateliers', 'message', 'Brouillon supprimé.');
}
