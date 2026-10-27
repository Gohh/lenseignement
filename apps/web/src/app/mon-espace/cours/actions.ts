'use server';

import type { CourseOutlineInput, UpdateCourseVersionInput } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Actions serveur de rédaction : le navigateur n'a jamais le jeton, et l'API décide des droits.

async function token(returnTo: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(path: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}`);
}

export async function createCourseAction(form: FormData): Promise<void> {
  const path = '/mon-espace/cours/nouveau';
  const result = await apiSend<{ courseId: string; versionId: string }>(
    await token(path),
    'POST',
    '/authoring/courses',
    {
      organizationId: text(form, 'organizationId'),
      branch: text(form, 'branch'),
      title: text(form, 'title'),
      summary: text(form, 'summary'),
    },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Création impossible.');
  redirect(
    `/mon-espace/cours/versions/${result.data.versionId}?message=${encodeURIComponent('Cours créé.')}`,
  );
}

export async function updateVersionAction(form: FormData): Promise<void> {
  const versionId = text(form, 'versionId');
  const path = `/mon-espace/cours/versions/${versionId}`;
  const minutes = text(form, 'estimatedMinutes');
  const programme = text(form, 'programme');
  const previous = text(form, 'previousProgramme');
  const [code, label] = programme.split('|');

  const input: UpdateCourseVersionInput = {
    revision: Number(text(form, 'revision')),
    title: text(form, 'title'),
    summary: text(form, 'summary'),
    audience: text(form, 'audience'),
    licence: text(form, 'licence'),
    estimatedMinutes: minutes ? Number(minutes) : null,
    curriculum:
      code && label
        ? {
            code,
            label,
            // Compétences cochées seulement si le programme n'a pas changé (sinon, à choisir ensuite).
            competencyCodes: programme === previous ? form.getAll('competency').map(String) : [],
          }
        : null,
  };
  const result = await apiSend(
    await token(path),
    'PATCH',
    `/authoring/course-versions/${versionId}`,
    input,
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Enregistrement impossible.');
  back(path, 'message', 'Informations enregistrées.');
}

export async function saveOutlineAction(
  versionId: string,
  input: CourseOutlineInput,
): Promise<{ ok: boolean; message: string; revision?: number }> {
  const result = await apiSend<{ revision: number }>(
    await token(`/mon-espace/cours/versions/${versionId}`),
    'PUT',
    `/authoring/course-versions/${versionId}/outline`,
    input,
  );
  return result.ok
    ? { ok: true, message: 'Plan enregistré.', revision: result.data.revision }
    : { ok: false, message: result.message ?? 'Enregistrement impossible.' };
}

export async function newVersionAction(form: FormData): Promise<void> {
  const courseId = text(form, 'courseId');
  const path = `/mon-espace/cours/${courseId}`;
  const result = await apiSend<{ versionId: string }>(
    await token(path),
    'POST',
    `/authoring/courses/${courseId}/versions`,
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Création impossible.');
  redirect(
    `/mon-espace/cours/versions/${result.data.versionId}?message=${encodeURIComponent('Nouvelle version créée.')}`,
  );
}
