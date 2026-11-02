'use server';

import { LEVEL_CODES, ORAL_MODELS, ORAL_SUBJECTS, type OralPart } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Évaluations orales : le navigateur n'a jamais le jeton, et l'API décide des droits.

const ID = /^[0-9a-f-]{36}$/i;
const HOME = '/mon-espace/oral';
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
  if (!ID.test(id)) redirect(HOME);
  return id;
}

export async function createOralTestAction(form: FormData): Promise<void> {
  const path = `${HOME}/nouvelle`;
  const model = text(form, 'model');
  const result = await apiSend<{ id: string }>(await token(path), 'POST', '/oral/tests', {
    organizationId: text(form, 'organizationId'),
    title: text(form, 'title'),
    subject: (ORAL_SUBJECTS as readonly string[]).includes(text(form, 'subject'))
      ? text(form, 'subject')
      : 'lecture',
    level: text(form, 'level'),
    model: (ORAL_MODELS as readonly string[]).includes(model) ? model : null,
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Création impossible.');
  back(
    `${HOME}/${result.data.id}`,
    'message',
    'Épreuve créée. Remplacez les exemples par vos propres éléments, puis faites-la publier.',
  );
}

/** Enregistrement de l'éditeur (appelé par le composant, qui garde les parties en mémoire). */
export async function saveOralTestAction(
  id: string,
  input: {
    organizationId: string;
    title: string;
    subject: string;
    level: string;
    parts: OralPart[];
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!ID.test(id)) return { ok: false, message: 'Épreuve introuvable.' };
  if (!(LEVEL_CODES as readonly string[]).includes(input.level)) {
    return { ok: false, message: 'Choisissez le niveau.' };
  }
  const result = await apiSend(await token(`${HOME}/${id}`), 'PUT', `/oral/tests/${id}`, input);
  return result.ok ? { ok: true } : { ok: false, message: result.message ?? 'Erreur.' };
}

export async function publishOralTestAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'POST', `/oral/tests/${id}/publish`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Publication impossible.');
  back(
    path,
    'message',
    'Épreuve publiée : elle est figée et prête à être passée dans les classes.',
  );
}

export async function copyOralTestAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend<{ id: string }>(await token(path), 'POST', `/oral/tests/${id}/copy`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Copie impossible.');
  back(`${HOME}/${result.data.id}`, 'message', 'Copie créée : vous pouvez la modifier.');
}

export async function deleteOralTestAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const result = await apiSend(await token(`${HOME}/${id}`), 'DELETE', `/oral/tests/${id}`);
  if (!result.ok) back(`${HOME}/${id}`, 'erreur', result.message ?? 'Suppression impossible.');
  back(HOME, 'message', 'Brouillon supprimé.');
}

export async function saveBenchmarksAction(form: FormData): Promise<void> {
  const path = `${HOME}/reperes`;
  const items = LEVEL_CODES.flatMap((level) =>
    ORAL_SUBJECTS.map((subject) => {
      const perMinute = Number.parseInt(text(form, `pm-${level}-${subject}`), 10);
      const questions = Number.parseInt(text(form, `q-${level}-${subject}`), 10);
      return {
        level,
        subject,
        perMinute: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : null,
        questions: Number.isFinite(questions) && questions >= 0 ? questions : null,
      };
    }),
  ).filter((i) => i.perMinute !== null);
  const result = await apiSend(await token(path), 'PUT', '/oral/benchmarks', { items });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Enregistrement impossible.');
  back(path, 'message', 'Repères enregistrés.');
}
