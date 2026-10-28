import { BRANCHES, type AuthoringOrganization } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createCourseAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Créer un cours' };

interface Props {
  searchParams: Promise<{ erreur?: string | string[] }>;
}

export default async function NewCoursePage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/cours/nouveau');
  const organizations = await apiGet<{ items: AuthoringOrganization[] }>(
    session.accessToken,
    '/authoring/organizations',
  );
  const items = organizations.ok ? organizations.data.items : [];
  // Seuls les espaces (cycles) accordés à la personne sont proposés ; l’API contrôle aussi.
  const allowed = new Set(items.flatMap((o) => o.branches));
  const choices = BRANCHES.filter((b) => allowed.has(b.code));
  const error = param((await searchParams).erreur);

  return (
    <section className="space-y-6">
      <Link href="/mon-espace/cours" className="inline-flex min-h-[44px] items-center underline">
        ← Mes cours
      </Link>
      <h1 className="text-3xl font-bold">Créer un cours</h1>
      <Notice error={error} />
      {items.length === 0 ? (
        <p>Vous n’êtes rattaché à aucun établissement où vous pouvez rédiger.</p>
      ) : (
        <form action={createCourseAction} className="space-y-4">
          <label className="block font-bold">
            Établissement
            <select name="organizationId" className={inputClass} required>
              {items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Espace
            <select name="branch" className={inputClass} required defaultValue={choices[0]?.code}>
              {choices.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Titre du cours
            <input name="title" className={inputClass} required minLength={3} maxLength={160} />
          </label>
          <label className="block font-bold">
            Résumé (facultatif)
            <textarea name="summary" className={inputClass} rows={3} maxLength={1000} />
          </label>
          <button type="submit" className={buttonClass}>
            Créer le brouillon
          </button>
        </form>
      )}
    </section>
  );
}
