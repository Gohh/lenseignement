'use server';

import {
  BRANCH_CODES,
  type OrganizationImportLine,
  type OrganizationImportResult,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Actions serveur de l'équipe : le navigateur n'a jamais le jeton, l'API décide des droits.

const PATH = '/mon-espace/equipe';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  return session.accessToken;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur' | 'code', value: string): never {
  redirect(`${PATH}?${kind}=${encodeURIComponent(value)}`);
}

/** Aucune case cochée ou toutes cochées : tous les cycles (null) ; sinon la liste choisie. */
function branchesOf(form: FormData): string[] | null {
  const chosen = form.getAll('branch').map(String);
  return chosen.length === 0 || chosen.length === BRANCH_CODES.length ? null : chosen;
}

export async function createOrganizationAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'POST', '/team/organizations', {
    name: text(form, 'name'),
    type: text(form, 'type'),
    parentId: text(form, 'parentId') || null,
  });
  if (!result.ok) back('erreur', result.message ?? 'Création impossible.');
  back('message', 'Établissement créé. Vous pouvez maintenant y inviter des personnes.');
}

export async function inviteMemberAction(form: FormData): Promise<void> {
  const result = await apiSend<{ code: string }>(await token(), 'POST', '/team/invitations', {
    organizationId: text(form, 'organizationId'),
    role: text(form, 'role'),
    branches: branchesOf(form),
  });
  if (!result.ok) back('erreur', result.message ?? 'Invitation impossible.');
  back('code', result.data.code);
}

export async function updateBranchesAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'PATCH', `/team/members/${text(form, 'memberId')}`, {
    branches: branchesOf(form),
  });
  if (!result.ok) back('erreur', result.message ?? 'Modification impossible.');
  back('message', 'Cycles mis à jour.');
}

export async function removeMemberAction(form: FormData): Promise<void> {
  const result = await apiSend(await token(), 'DELETE', `/team/members/${text(form, 'memberId')}`);
  if (!result.ok) back('erreur', result.message ?? 'Retrait impossible.');
  back('message', 'Rôle retiré.');
}

export type ImportState =
  | { lines: OrganizationImportLine[]; created: number; confirmed: boolean; csv: string }
  | { error: string }
  | null;

/** Aperçu du fichier, puis création si la personne a confirmé (même fichier, second bouton). */
export async function importOrganizationsAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  // Après l'aperçu, React vide le champ fichier : la confirmation reprend le texte gardé.
  const file = form.get('file');
  const csv =
    file instanceof File && file.size > 0 ? await file.text() : String(form.get('csv') ?? '');
  if (!csv.trim()) return { error: 'Choisissez un fichier CSV.' };
  const result = await apiSend<OrganizationImportResult>(
    await token(),
    'POST',
    '/team/organizations/import',
    { csv, confirm: form.get('confirm') === '1' },
  );
  return result.ok ? { ...result.data, csv } : { error: result.message ?? 'Import impossible.' };
}
