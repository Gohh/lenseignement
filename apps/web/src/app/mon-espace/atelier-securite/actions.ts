'use server';

import type { SimulationOverview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { SAFETY_SIMULATION as CODE } from '@/lib/simulation';
import { getSession } from '@/lib/session';

// Atelier virtuel (ADR-014) : le navigateur n'a jamais le jeton, et l'API corrige et décide.

const PAGE = '/mon-espace/atelier-securite';

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PAGE)}`);
  return session.accessToken;
}

function back(kind: 'message' | 'erreur', value: string): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(value)}`);
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
  const result = await apiSend<SimulationOverview>(
    await token(),
    'POST',
    `/me/simulations/${CODE}/attempts`,
    submission(form),
  );
  if (!result.ok) back('erreur', result.message ?? 'Essai non enregistré.');
  back(
    'message',
    result.data.lastAttempt?.passed
      ? 'Bravo, simulation réussie ! Tu peux demander ta séance pratique avec ton formateur.'
      : 'Pas encore : lis ce qu’il faut revoir, puis recommence quand tu veux.',
  );
}

export async function requestPracticeAction(): Promise<void> {
  const result = await apiSend<SimulationOverview>(
    await token(),
    'POST',
    `/me/simulations/${CODE}/practice-request`,
    {},
  );
  if (!result.ok) back('erreur', result.message ?? 'Demande non enregistrée.');
  back('message', 'Demande enregistrée. Ton formateur organisera la séance avec toi.');
}
