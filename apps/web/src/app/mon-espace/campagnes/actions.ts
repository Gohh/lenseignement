'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { paperRows } from '@/lib/paper-form';
import { getSession } from '@/lib/session';

// Campagnes d'évaluation : le navigateur n'a jamais le jeton, et l'API décide des droits.

const ID = /^[0-9a-f-]{36}$/i;
const HOME = '/mon-espace/campagnes';
const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

async function token(returnTo: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session.accessToken;
}

function back(path: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(value)}`);
}

function idOf(form: FormData): string {
  const id = text(form, 'id');
  if (!ID.test(id)) redirect(HOME);
  return id;
}

export async function createCampaignAction(form: FormData): Promise<void> {
  const zone = text(form, 'zone');
  const fields = {
    examId: text(form, 'examId'),
    title: text(form, 'title'),
    zoneId: zone === 'pays' ? null : zone,
    level: text(form, 'level'),
    startsAt: text(form, 'startsAt'),
    endsAt: text(form, 'endsAt'),
  };
  const query = new URLSearchParams({
    zone,
    level: fields.level,
    examId: fields.examId,
    title: fields.title,
    startsAt: fields.startsAt,
    endsAt: fields.endsAt,
  });
  const path = `${HOME}/nouvelle?${query.toString()}`;
  const result = await apiSend<{ id: string; classes: number }>(
    await token(`${HOME}/nouvelle`),
    'POST',
    '/authoring/campaigns',
    fields,
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Lancement impossible.');
  const n = result.data.classes;
  back(
    `${HOME}/${result.data.id}`,
    'message',
    `Campagne lancée : ${n} classe${n > 1 ? 's la reçoivent' : ' la reçoit'}. Chaque école choisit en ligne ou sur papier.`,
  );
}

export async function setCampaignModeAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const cohortId = text(form, 'cohortId');
  const path = `${HOME}/${id}`;
  if (!ID.test(cohortId)) redirect(path);
  const onPaper = text(form, 'mode') === 'papier';
  const result = await apiSend(
    await token(path),
    'PUT',
    `/authoring/campaigns/${id}/classes/${cohortId}/mode`,
    { onPaper },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Changement impossible.');
  back(
    path,
    'message',
    onPaper
      ? 'Sur papier : imprimez le livret, puis saisissez les copies.'
      : 'En ligne : les élèves la trouvent dans leurs devoirs.',
  );
}

export async function saveCampaignPaperAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const cohortId = text(form, 'cohortId');
  if (!ID.test(cohortId)) redirect(`${HOME}/${id}`);
  const path = `${HOME}/${id}/saisie?classe=${cohortId}`;
  const result = await apiSend<{ saved: number; removed: number }>(
    await token(path),
    'PUT',
    `/authoring/campaigns/${id}/paper`,
    { cohortId, rows: paperRows(form) },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Enregistrement impossible.');
  const { saved, removed } = result.data;
  back(
    path,
    'message',
    `Copies enregistrées : ${saved}.${removed ? ` Copies effacées : ${removed}.` : ''} Les notes restent cachées jusqu’à la fin de la campagne.`,
  );
}

export async function closeCampaignAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'POST', `/authoring/campaigns/${id}/close`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Clôture impossible.');
  back(
    path,
    'message',
    'Campagne close : les élèves et les enseignants voient maintenant les notes.',
  );
}

export async function deleteCampaignAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'DELETE', `/authoring/campaigns/${id}`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Suppression impossible.');
  back(HOME, 'message', 'Campagne supprimée.');
}
