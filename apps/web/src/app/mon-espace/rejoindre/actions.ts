'use server';

import type { InvitationPreview, RedeemResult } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/rejoindre';

export async function joinTeamAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const code = String(form.get('code') ?? '').trim();
  const preview = await apiSend<InvitationPreview>(
    session.accessToken,
    'POST',
    '/team/invitations/preview',
    { code },
  );
  if (!preview.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(preview.message ?? 'Code invalide ou expiré.')}`);
  }
  // Rôle qui enseigne : d'abord la fiche « Mes niveaux et mes matières ».
  if (preview.data.needsValidation) redirect(`${PATH}/fiche?code=${encodeURIComponent(code)}`);
  const result = await apiSend<RedeemResult>(
    session.accessToken,
    'POST',
    '/team/invitations/redeem',
    { code },
  );
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Code invalide ou expiré.')}`);
  }
  redirect(
    `${PATH}?message=${encodeURIComponent(`Bienvenue dans l’équipe de ${result.data.organization}.`)}`,
  );
}

/** Envoie la fiche « Mes niveaux et mes matières » à la direction. */
export async function sendRequestAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const code = String(form.get('code') ?? '').trim();
  const others = String(form.get('others') ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result = await apiSend<RedeemResult>(
    session.accessToken,
    'POST',
    '/team/invitations/redeem',
    {
      code,
      levels: form.getAll('level').map(String),
      subjects: [...form.getAll('subject').map(String), ...others],
    },
  );
  if (!result.ok) {
    redirect(
      `${PATH}/fiche?code=${encodeURIComponent(code)}&erreur=${encodeURIComponent(result.message ?? 'Envoi impossible.')}`,
    );
  }
  redirect(
    `${PATH}?message=${encodeURIComponent(`Votre demande est envoyée à la direction de ${result.data.organization}. Vous aurez accès dès qu’elle l’aura validée.`)}`,
  );
}

export async function joinCohortAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const result = await apiSend<{ cohort: string; organization: string }>(
    session.accessToken,
    'POST',
    '/me/join-cohort',
    { code: String(form.get('code') ?? '').trim() },
  );
  if (!result.ok) {
    redirect(`${PATH}?erreur=${encodeURIComponent(result.message ?? 'Code de classe invalide.')}`);
  }
  redirect(
    `${PATH}?message=${encodeURIComponent(`Tu es dans la classe ${result.data.cohort} de ${result.data.organization}.`)}`,
  );
}
