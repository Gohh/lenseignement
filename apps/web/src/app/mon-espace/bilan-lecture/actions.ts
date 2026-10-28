'use server';

import type { RemediationOverview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { READING_DIAGNOSTIC as CODE } from '@/lib/remediation';
import { getSession } from '@/lib/session';

// Bilan et rattrapage (ADR-013) : le navigateur n'a jamais le jeton, et l'API décide des droits.

const PAGE = '/mon-espace/bilan-lecture';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function token(returnTo: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session.accessToken;
}

function back(path: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(value)}`);
}

function submission(form: FormData) {
  return {
    sessionId: String(form.get('sessionId') ?? ''),
    answers: [...form.entries()]
      .filter(([name]) => name.startsWith('q-'))
      .map(([name, value]) => ({ itemId: name.slice(2), choice: Number(value) })),
  };
}

export async function submitDiagnosticAction(form: FormData): Promise<void> {
  const result = await apiSend<RemediationOverview>(
    await token(PAGE),
    'POST',
    `/me/remediation/${CODE}/diagnostic`,
    submission(form),
  );
  if (!result.ok) back(PAGE, 'erreur', result.message ?? 'Bilan non enregistré.');
  back(PAGE, 'message', 'Bilan enregistré. Voici ce que nous te proposons.');
}

export async function submitPostTestAction(form: FormData): Promise<void> {
  const result = await apiSend<RemediationOverview>(
    await token(PAGE),
    'POST',
    `/me/remediation/${CODE}/post-test`,
    submission(form),
  );
  if (!result.ok) back(PAGE, 'erreur', result.message ?? 'Petit test non enregistré.');
  back(
    PAGE,
    'message',
    result.data.postTest?.mastered
      ? 'Bravo, c’est acquis !'
      : 'Pas encore : relis le cours, puis réessaie quand tu veux.',
  );
}

/** Correction de l'orientation par l'enseignant, depuis la fiche de l'élève. */
export async function overrideRemediationAction(form: FormData): Promise<void> {
  const learnerId = String(form.get('learnerId') ?? '');
  if (!UUID.test(learnerId)) redirect('/mon-espace');
  const path = `/mon-espace/eleves/${learnerId}`;
  const result = await apiSend<RemediationOverview>(
    await token(path),
    'POST',
    `/learners/${learnerId}/remediation/${CODE}/override`,
    {
      competencyCode: String(form.get('competencyCode') ?? ''),
      reason: String(form.get('reason') ?? '').trim(),
    },
  );
  if (!result.ok) back(path, 'erreur', result.message ?? 'Orientation non modifiée.');
  back(path, 'message', 'Orientation modifiée. L’élève la voit dans son bilan.');
}
