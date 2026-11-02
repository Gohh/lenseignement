'use server';

import { AI_PROVIDERS, type AiTestResult } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

// Réglages de l'IA : la clé passe du formulaire à l'API sans jamais revenir au navigateur.

const HOME = '/mon-espace/configuration/ia';
const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

function back(kind: 'message' | 'erreur', value: string): never {
  redirect(`${HOME}?${kind}=${encodeURIComponent(value)}`);
}

async function token(): Promise<string> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(HOME)}`);
  return session.accessToken;
}

export async function saveAiSettingsAction(form: FormData): Promise<void> {
  const provider = text(form, 'provider');
  const result = await apiSend(await token(), 'PUT', '/admin/ai', {
    enabled: form.get('enabled') === 'on',
    provider: (AI_PROVIDERS as readonly string[]).includes(provider) ? provider : 'mistral',
    model: text(form, 'model'),
    baseUrl: text(form, 'baseUrl'),
    apiKey: text(form, 'apiKey'),
    removeKey: form.get('removeKey') === 'on',
    dailyLimit: Number(text(form, 'dailyLimit')) || 30,
  });
  if (!result.ok) back('erreur', result.message ?? 'Réglages non enregistrés.');
  back(
    'message',
    form.get('enabled') === 'on'
      ? 'Réglages enregistrés : l’IA est allumée. Essayez la connexion.'
      : 'Réglages enregistrés : l’IA est éteinte.',
  );
}

export async function testAiAction(): Promise<void> {
  const result = await apiSend<AiTestResult>(await token(), 'POST', '/admin/ai/test');
  if (!result.ok) back('erreur', result.message ?? 'Essai impossible.');
  back(result.data.ok ? 'message' : 'erreur', result.data.message);
}
