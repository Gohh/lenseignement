'use server';

import { BRANCH_CODES, type CreatedAccount } from '@lenseignement/types';
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

export interface CreateAccountState {
  error?: string;
  created?: CreatedAccount;
}

/** Crée le compte ; le mot de passe provisoire revient dans l'état, jamais dans l'adresse de la page. */
export async function createAccountAction(
  _previous: CreateAccountState,
  form: FormData,
): Promise<CreateAccountState> {
  const result = await apiSend<CreatedAccount>(await token(), 'POST', '/team/accounts', {
    displayName: text(form, 'displayName'),
    email: text(form, 'email'),
    organizationId: text(form, 'organizationId'),
    role: text(form, 'role'),
    branches: branchesOf(form),
  });
  if (!result.ok) return { error: result.message ?? 'Création impossible.' };
  return { created: result.data };
}
