'use server';

import type { SimulationOverview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';
import { simulationSubmission } from '@/lib/simulation-form';

// Atelier virtuel (ADR-014) : le navigateur n'a jamais le jeton, et l'API corrige et décide.

const CODE = /^[A-Z0-9-]{1,60}$/;
const page = (code: string) => `/mon-espace/atelier/${encodeURIComponent(code)}`;

function codeOf(form: FormData): string {
  const code = String(form.get('code') ?? '');
  if (!CODE.test(code)) redirect('/mon-espace/atelier');
  return code;
}

async function token(code: string): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(page(code))}`);
  return session.accessToken;
}

function back(code: string, kind: 'message' | 'erreur', value: string): never {
  redirect(`${page(code)}?${kind}=${encodeURIComponent(value)}`);
}

export async function submitSimulationAction(form: FormData): Promise<void> {
  const code = codeOf(form);
  const result = await apiSend<SimulationOverview>(
    await token(code),
    'POST',
    `/me/simulations/${code}/attempts`,
    simulationSubmission(form),
  );
  if (!result.ok) back(code, 'erreur', result.message ?? 'Essai non enregistré.');
  back(
    code,
    'message',
    result.data.lastAttempt?.passed
      ? result.data.practice.status === 'none'
        ? 'Bravo, atelier réussi !'
        : 'Bravo, simulation réussie ! Tu peux demander ta séance pratique avec ton formateur.'
      : 'Pas encore : lis ce qu’il faut revoir, puis recommence quand tu veux.',
  );
}

export async function requestPracticeAction(form: FormData): Promise<void> {
  const code = codeOf(form);
  const result = await apiSend<SimulationOverview>(
    await token(code),
    'POST',
    `/me/simulations/${code}/practice-request`,
    {},
  );
  if (!result.ok) back(code, 'erreur', result.message ?? 'Demande non enregistrée.');
  back(code, 'message', 'Demande enregistrée. Ton formateur organisera la séance avec toi.');
}
