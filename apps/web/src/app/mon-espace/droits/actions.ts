'use server';

import { RIGHT_DEFINITIONS } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Enregistre les cases de l'écran « Droits » : une case décochée est un droit retiré. */
export async function saveRightsAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/droits');
  const kept = new Set(form.getAll('garde').map(String));
  const withdrawn = RIGHT_DEFINITIONS.flatMap((d) =>
    d.profiles
      .filter((profile) => !kept.has(`${profile} ${d.code}`))
      .map((profile) => ({ profile, right: d.code })),
  );
  const result = await apiSend(session.accessToken, 'PUT', '/admin/rights', { withdrawn });
  if (!result.ok) {
    redirect(`/mon-espace/droits?erreur=${encodeURIComponent(result.message ?? 'Refusé.')}`);
  }
  redirect(`/mon-espace/droits?message=${encodeURIComponent('Droits enregistrés.')}`);
}
