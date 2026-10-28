import { levelLabel, type TutoredChild } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { redeemCodeAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Répétiteur' };

interface Props {
  searchParams: Promise<{ message?: string | string[]; erreur?: string | string[] }>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function TutorPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/repetiteur');
  const query = await searchParams;
  const tutored = await apiGet<{ items: TutoredChild[] }>(session.accessToken, '/family/tutored');
  const items = tutored.ok ? tutored.data.items : [];

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Répétiteur</h1>
      <p>
        Un parent vous a donné un code ? Saisissez-le pour suivre les progrès de ses enfants. Vous
        pouvez les consulter, sans rien modifier.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <form action={redeemCodeAction} className={`${cardClass} space-y-4`}>
        <label className="block font-bold">
          Code d’invitation
          <input
            name="code"
            className={`${inputClass} uppercase tracking-widest`}
            required
            minLength={4}
            maxLength={20}
            autoComplete="off"
          />
        </label>
        <button type="submit" className={buttonClass}>
          Valider le code
        </button>
      </form>

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Enfants que je suis</h2>
        {items.length === 0 ? (
          <p className="mt-2">Aucun enfant pour l’instant.</p>
        ) : (
          <ul className="mt-3 space-y-3" role="list">
            {items.map((child) => (
              <li key={child.id} className="rounded-card border border-line p-4">
                <p className="text-lg font-bold">{child.displayName}</p>
                <p className="text-ink-muted">
                  {child.level ? (levelLabel(child.level) ?? child.level) : 'Niveau non précisé'}
                </p>
                <Link
                  href={`/mon-espace/eleves/${child.id}`}
                  className="mt-2 inline-flex min-h-[44px] items-center font-bold underline"
                >
                  Voir ses progrès
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
