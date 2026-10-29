'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Actions serveur de l'écran « Programmes » : l'API décide des droits (publication : superadministrateur).

const PATH = '/mon-espace/configuration/programmes';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

const versionPath = (code: string, label: string) =>
  `${PATH}/${encodeURIComponent(code)}/${encodeURIComponent(label)}`;

function back(kind: 'message' | 'erreur', value: string, path: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value.slice(0, 280))}`);
}

export type ImportCurriculumState = { error: string } | null;

/** Import d'un fichier JSON : en cas d'erreur, le détail reste dans la fenêtre (il peut être long). */
export async function importCurriculumAction(
  _prev: ImportCurriculumState,
  form: FormData,
): Promise<ImportCurriculumState> {
  const file = form.get('file');
  const json = file instanceof File && file.size > 0 ? await file.text() : '';
  if (!json) return { error: 'Choisissez un fichier de programme (.json).' };
  const result = await apiSend<{ code: string; label: string }>(
    await token(),
    'POST',
    '/admin/curricula',
    { json },
  );
  if (!result.ok) return { error: result.message ?? 'Import impossible.' };
  back(
    'message',
    'Brouillon importé. Relisez-le, puis publiez-le avec sa date d’entrée en vigueur.',
    versionPath(result.data.code, result.data.label),
  );
}

export async function publishCurriculumAction(form: FormData): Promise<void> {
  const path = versionPath(text(form, 'code'), text(form, 'label'));
  const result = await apiSend(
    await token(),
    'POST',
    `/admin/curricula/${encodeURIComponent(text(form, 'code'))}/versions/${encodeURIComponent(text(form, 'label'))}/publish`,
    { effectiveFrom: text(form, 'effectiveFrom') },
  );
  if (!result.ok) back('erreur', result.message ?? 'Publication impossible.', path);
  back('message', 'Version publiée : elle s’appliquera à partir de la date choisie.', path);
}

export async function deleteCurriculumDraftAction(form: FormData): Promise<void> {
  const code = text(form, 'code');
  const label = text(form, 'label');
  const result = await apiSend(
    await token(),
    'DELETE',
    `/admin/curricula/${encodeURIComponent(code)}/versions/${encodeURIComponent(label)}`,
  );
  if (!result.ok)
    back('erreur', result.message ?? 'Suppression impossible.', versionPath(code, label));
  back('message', `Brouillon ${code} ${label} supprimé.`, PATH);
}
