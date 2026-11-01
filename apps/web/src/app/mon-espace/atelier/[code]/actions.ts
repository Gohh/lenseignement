'use server';

import type { SimulationOverview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

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

/**
 * Champs du formulaire : `s:<étape>` (étape présente), `i:<étape>:<question>` (choix),
 * `e:<étape>` (équipements cochés), `o:<étape>:<place>` (geste à cette place).
 */
function submission(form: FormData) {
  const steps = new Map<string, Array<[number, number]>>();
  for (const [name, value] of form.entries()) {
    const [kind, stepId, index] = name.split(':');
    if (!stepId || !['s', 'i', 'e', 'o'].includes(kind!)) continue;
    const list = steps.get(stepId) ?? [];
    steps.set(stepId, list);
    if (kind === 's' || value === '') continue;
    list.push([kind === 'e' ? list.length : Number(index), Number(value)]);
  }
  return {
    attemptId: String(form.get('attemptId') ?? ''),
    steps: [...steps].map(([stepId, list]) => ({
      stepId,
      choices: list.sort((a, b) => a[0] - b[0]).map(([, choice]) => choice),
    })),
  };
}

export async function submitSimulationAction(form: FormData): Promise<void> {
  const code = codeOf(form);
  const result = await apiSend<SimulationOverview>(
    await token(code),
    'POST',
    `/me/simulations/${code}/attempts`,
    submission(form),
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
