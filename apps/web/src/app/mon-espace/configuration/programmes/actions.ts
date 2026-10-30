'use server';

import { CurriculumTableMetaSchema, curriculumFromTable } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Actions serveur de l'écran « Programmes » : l'API décide des droits (publication : référent pédagogique).

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

/**
 * Import d'un tableau (Excel enregistré en CSV) : le formulaire donne le programme et la
 * version, le tableau les compétences. Il est transformé en fichier de programme ici, puis
 * vérifié par l'API comme un fichier JSON.
 */
export async function importCurriculumTableAction(
  _prev: ImportCurriculumState,
  form: FormData,
): Promise<ImportCurriculumState> {
  const file = form.get('table');
  const csv = file instanceof File && file.size > 0 ? await file.text() : '';
  if (!csv) return { error: 'Choisissez le tableau des compétences (.csv).' };
  if (csv.length > 900_000) return { error: 'Le tableau est trop gros (900 Ko au plus).' };
  const meta = CurriculumTableMetaSchema.safeParse({
    code: text(form, 'code'),
    branch: text(form, 'branch'),
    title: text(form, 'title'),
    description: text(form, 'description'),
    label: text(form, 'label'),
    sourceTitle: text(form, 'sourceTitle'),
    sourceIssuer: text(form, 'sourceIssuer'),
    isOfficial: form.get('isOfficial') === 'on',
  });
  if (!meta.success) {
    return { error: meta.error.issues.map((i) => i.message).join('\n') };
  }
  const { file: curriculum, errors } = curriculumFromTable(csv, meta.data);
  if (errors.length > 0) return { error: errors.slice(0, 20).join('\n') };
  const result = await apiSend<{ code: string; label: string }>(
    await token(),
    'POST',
    '/admin/curricula',
    { json: JSON.stringify(curriculum) },
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
