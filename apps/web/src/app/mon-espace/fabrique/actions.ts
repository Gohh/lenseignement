'use server';

import {
  ExerciseAnswerSchema,
  type ExerciseAnswer,
  type ExerciseImportResult,
  type ExerciseResult,
  type GenerateExercisesResult,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Fabrique d'exercices : le navigateur n'a jamais le jeton, et l'API décide des droits.

const ID = /^[0-9a-f-]{36}$/i;
const HOME = '/mon-espace/fabrique';
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

export async function createExerciseAction(form: FormData): Promise<void> {
  const path = `${HOME}/nouveau`;
  const result = await apiSend<{ id: string }>(await token(path), 'POST', '/authoring/exercises', {
    organizationId: text(form, 'organizationId'),
    competencyId: text(form, 'competencyId'),
    domain: text(form, 'domain'),
    difficulty: text(form, 'difficulty'),
    skill: text(form, 'skill'),
    kind: text(form, 'kind'),
    title: text(form, 'title'),
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Création impossible.');
  back(`${HOME}/${result.data.id}`, 'message', 'Exercice créé. Écrivez-le, puis enregistrez.');
}

/** Enregistre tout le brouillon : la fiche et le contenu arrivent en JSON (champ `payload`). */
export async function saveExerciseAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  let payload: unknown;
  try {
    payload = JSON.parse(text(form, 'payload'));
  } catch {
    back(path, 'erreur', 'Formulaire illisible : réessayez.');
  }
  const result = await apiSend(await token(path), 'PUT', `/authoring/exercises/${id}`, payload);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Enregistrement impossible.');
  back(path, 'message', 'Brouillon enregistré.');
}

const STEPS: Record<string, { path: string; done: string }> = {
  submit: { path: 'submit', done: 'Envoyé en relecture.' },
  publish: { path: 'publish', done: 'Exercice publié : il rejoint la banque.' },
  archive: { path: 'archive', done: 'Exercice retiré de la banque.' },
  restore: { path: 'restore', done: 'Exercice remis dans la banque.' },
};

export async function exerciseStepAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const step = STEPS[text(form, 'step')];
  if (!step) redirect(path);
  const result = await apiSend(
    await token(path),
    'POST',
    `/authoring/exercises/${id}/${step.path}`,
    {},
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Action impossible.');
  back(path, 'message', step.done);
}

export async function returnExerciseAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'POST', `/authoring/exercises/${id}/return`, {
    note: text(form, 'note'),
  });
  if (!result.ok) back(path, 'erreur', result.message ?? 'Action impossible.');
  back(path, 'message', 'Exercice renvoyé à son auteur avec votre remarque.');
}

/** « Modifier » un exercice publié, ou copier un exercice de la banque commune. */
export async function copyExerciseAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const organizationId = text(form, 'organizationId');
  const result = await apiSend<{ id: string }>(
    await token(path),
    'POST',
    `/authoring/exercises/${id}/copy`,
    { organizationId: ID.test(organizationId) ? organizationId : null },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Copie impossible.');
  back(
    `${HOME}/${result.data.id}`,
    'message',
    'Brouillon ouvert : il remplacera l’exercice publié quand il sera relu.',
  );
}

export async function deleteExerciseAction(form: FormData): Promise<void> {
  const id = idOf(form);
  const path = `${HOME}/${id}`;
  const result = await apiSend(await token(path), 'DELETE', `/authoring/exercises/${id}`);
  if (!result.ok) back(path, 'erreur', result.message ?? 'Suppression impossible.');
  back(HOME, 'message', 'Brouillon supprimé.');
}

/** Aperçu : corrige la réponse comme le fera la plateforme pour l'élève. */
export async function checkExerciseAction(
  id: string,
  answer: ExerciseAnswer,
): Promise<ExerciseResult | { error: string }> {
  if (!ID.test(id)) return { error: 'Exercice introuvable.' };
  const parsed = ExerciseAnswerSchema.safeParse(answer);
  if (!parsed.success) return { error: 'Réponse illisible.' };
  const session = await getSession();
  if (!session) return { error: 'Connectez-vous de nouveau.' };
  const result = await apiSend<ExerciseResult>(
    session.accessToken,
    'POST',
    `/authoring/exercises/${id}/check`,
    parsed.data,
  );
  return result.ok ? result.data : { error: result.message ?? 'Correction impossible.' };
}

export type ImportState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; created: number; errors: ExerciseImportResult['errors'] };

/** Import d'un fichier d'exercices (.json) : les exercices valables partent en relecture. */
export async function importExercisesAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { kind: 'error', message: 'Choisissez le fichier à importer.' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { kind: 'error', message: 'Fichier trop lourd : 2 Mo au plus.' };
  }
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { kind: 'error', message: 'Fichier illisible : il doit être au format du modèle.' };
  }
  const items = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as { exercices?: unknown; items?: unknown }).exercices ??
        (data as { items?: unknown }).items)
      : null;
  if (!Array.isArray(items)) {
    return { kind: 'error', message: 'Aucune liste « exercices » dans ce fichier.' };
  }
  const session = await getSession();
  if (!session) return { kind: 'error', message: 'Connectez-vous de nouveau.' };
  const result = await apiSend<ExerciseImportResult>(
    session.accessToken,
    'POST',
    '/authoring/exercises/import',
    {
      organizationId: text(form, 'organizationId'),
      curriculumVersionId: text(form, 'curriculumVersionId'),
      items,
    },
  );
  if (!result.ok) return { kind: 'error', message: result.message ?? 'Import impossible.' };
  return { kind: 'done', created: result.data.created, errors: result.data.errors };
}

/** « Proposer avec l'IA » : les exercices proposés arrivent en brouillon, à relire. */
export async function generateExercisesAction(form: FormData): Promise<void> {
  const path = `${HOME}/ia`;
  const result = await apiSend<GenerateExercisesResult>(
    await token(path),
    'POST',
    '/authoring/ai/exercises',
    {
      organizationId: text(form, 'organizationId'),
      competencyId: text(form, 'competencyId'),
      domain: text(form, 'domain'),
      difficulty: text(form, 'difficulty'),
      skill: text(form, 'skill'),
      kind: text(form, 'kind'),
      count: Number(text(form, 'count')) || 3,
      notes: text(form, 'notes'),
    },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Proposition impossible.');
  const { created, ids, errors } = result.data;
  if (created === 0) {
    back(path, 'erreur', `Aucun exercice utilisable : ${errors[0]?.message ?? 'réessayez.'}`);
  }
  const refused =
    errors.length > 0
      ? ` (${errors.length} écarté${errors.length > 1 ? 's' : ''}, mal formé${errors.length > 1 ? 's' : ''})`
      : '';
  redirect(
    `${path}?faits=${ids.join(',')}&message=${encodeURIComponent(
      `${created} exercice${created > 1 ? 's' : ''} proposé${created > 1 ? 's' : ''} en brouillon${refused}. Relisez et corrigez chacun avant de l’envoyer en relecture.`,
    )}`,
  );
}
