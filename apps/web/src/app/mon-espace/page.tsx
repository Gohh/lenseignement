import { redirect } from 'next/navigation';
import { serverEnv } from '@/lib/env';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon espace' };

const ROLE_LABELS: Record<string, string> = {
  apprenant: 'Apprenant',
  parent: 'Parent ou tuteur',
  enseignant: 'Enseignant ou formateur',
  alphabetiseur: 'Alphabétiseur',
  'referent-pedagogique': 'Référent pédagogique',
  'admin-plateforme': 'Administrateur de la plateforme',
};

/** Vérifie que l'API reconnaît bien le jeton de la session (chaîne complète OIDC → API). */
async function apiIdentity(accessToken: string): Promise<{ subject: string } | null> {
  try {
    const res = await fetch(`${serverEnv().API_INTERNAL_URL}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as { subject: string }) : null;
  } catch {
    return null;
  }
}

export default async function MyspacePage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace');

  const identity = await apiIdentity(session.accessToken);
  const roles = session.roles.filter((role) => role in ROLE_LABELS);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Bonjour, {session.displayName}</h1>
      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="text-lg font-bold">Vos profils</h2>
        {roles.length > 0 ? (
          <ul className="mt-2 list-disc pl-6">
            {roles.map((role) => (
              <li key={role}>{ROLE_LABELS[role]}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">Aucun profil n’est encore attribué à votre compte.</p>
        )}
        <p className="mt-3 text-sm text-ink-muted" data-testid="api-status">
          {identity ? 'Compte reconnu par le service.' : 'Service momentanément indisponible.'}
        </p>
      </div>
      <form method="post" action="/auth/logout">
        <button
          type="submit"
          className="min-h-[44px] rounded-card border border-line-strong bg-surface px-5 font-bold text-ink"
        >
          Se déconnecter
        </button>
      </form>
    </section>
  );
}
