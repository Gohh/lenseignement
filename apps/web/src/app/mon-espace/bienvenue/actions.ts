'use server';

import { redirect } from 'next/navigation';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';

const PATH = '/mon-espace/bienvenue';
const PROFILES = ['apprenant', 'parent', 'repetiteur'];

/** Enregistre le ou les profils choisis, puis ouvre la première étape de chacun. */
export async function chooseProfilesAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(PATH)}`);
  const picked = form.getAll('profile').map(String);
  const profiles = PROFILES.filter((p) => picked.includes(p));
  const team = picked.includes('equipe');
  if (profiles.length > 0) {
    const result = await apiSend(session.accessToken, 'PUT', '/me/profiles', { profiles });
    if (!result.ok) {
      redirect(
        `${PATH}?erreur=${encodeURIComponent(result.message ?? 'Enregistrement impossible.')}`,
      );
    }
  } else if (!team) {
    redirect(`${PATH}?erreur=${encodeURIComponent('Choisissez au moins un profil.')}`);
  }
  // Première étape : l'apprenant choisit son niveau, le parent ajoute ses enfants, etc.
  if (profiles.includes('apprenant')) {
    redirect('/mon-espace/compte?bienvenue=1&next=/catalogue');
  }
  if (profiles.includes('parent')) redirect('/mon-espace/famille');
  if (profiles.includes('repetiteur')) redirect('/mon-espace/repetiteur');
  redirect('/mon-espace/rejoindre');
}
