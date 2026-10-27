import type { ReviewQueueItem } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { STATUS_LABELS } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'À relire et à publier' };

export default async function ReviewQueuePage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/relecture');

  const queue = await apiGet<{ items: ReviewQueueItem[] }>(
    session.accessToken,
    '/authoring/reviews',
  );

  return (
    <section className="space-y-6">
      <Link href="/mon-espace" className="inline-flex min-h-[44px] items-center underline">
        ← Retour à mon espace
      </Link>
      <h1 className="text-3xl font-bold">À relire et à publier</h1>
      <p>
        Une version est d’abord approuvée par un référent pédagogique, puis publiée par une deuxième
        personne. L’auteur d’un cours ne valide jamais son propre travail.
      </p>
      {queue.ok && queue.data.items.length > 0 ? (
        <ul className="space-y-3">
          {queue.data.items.map((item) => (
            <li key={item.versionId} className="rounded-card border border-line bg-surface p-4">
              <Link
                href={`/mon-espace/cours/versions/${item.versionId}`}
                className="inline-flex min-h-[44px] items-center text-lg font-bold underline"
              >
                {item.title}
              </Link>
              <p className="text-sm text-ink-muted">
                {item.organization.name} · version {item.number} ·{' '}
                {STATUS_LABELS[item.status] ?? item.status}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucune version n’attend de validation.</p>
      )}
    </section>
  );
}
