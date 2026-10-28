'use server';

import type { CourseOutlineInput, LevelCode, UpdateCourseVersionInput } from '@lenseignement/types';
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
    // Champ absent (espace sans niveaux) : on ne touche pas au niveau.
    ...(form.has('level') ? { level: (text(form, 'level') || null) as LevelCode | null } : {}),
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

// Circuit de validation (ADR-006) : l'API vérifie le rôle et l'indépendance des personnes.

async function reviewStep(
  form: FormData,
  step: 'submit' | 'approve' | 'request-changes' | 'publish' | 'withdraw',
  body: object | undefined,
  success: string,
): Promise<void> {
  const versionId = text(form, 'versionId');
  const path = `/mon-espace/cours/versions/${versionId}`;
  const result = await apiSend(
    await token(path),
    'POST',
    `/authoring/course-versions/${versionId}/${step}`,
    body,
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Action impossible.');
  back(path, 'message', success);
}

export async function submitForReviewAction(form: FormData): Promise<void> {
  await reviewStep(
    form,
    'submit',
    { revision: Number(text(form, 'revision')) },
    'Version envoyée en relecture.',
  );
}

export async function approveAction(form: FormData): Promise<void> {
  const checked = (name: string) => form.get(name) === 'on';
  await reviewStep(
    form,
    'approve',
    {
      checklist: {
        pedagogy: checked('pedagogy'),
        accessibility: checked('accessibility'),
        rights: checked('rights'),
      },
      comment: text(form, 'comment'),
    },
    'Version approuvée. Une deuxième personne doit maintenant la publier.',
  );
}

export async function requestChangesAction(form: FormData): Promise<void> {
  await reviewStep(
    form,
    'request-changes',
    { comment: text(form, 'comment') },
    'Modifications demandées : la version est revenue en brouillon chez son auteur.',
  );
}

export async function publishAction(form: FormData): Promise<void> {
  await reviewStep(form, 'publish', undefined, 'Version publiée.');
}

export async function withdrawAction(form: FormData): Promise<void> {
  await reviewStep(form, 'withdraw', { comment: text(form, 'comment') }, 'Version retirée.');
}
