import {
  WORKSHOP_STATUS_LABELS,
  WORKSHOP_TRADE_ICONS,
  WORKSHOP_TRADE_LABELS,
  type WorkshopSummary,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ateliers' };

const badge: Record<WorkshopSummary['status'], string> = {
  draft: 'bg-line text-ink',
  review: 'bg-accent-soft text-accent-ink',
  published: 'bg-primary-soft text-primary',
  archived: 'bg-line text-ink-muted',
};

function Row({ w }: { w: WorkshopSummary }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span aria-hidden="true" className="text-2xl">
        {WORKSHOP_TRADE_ICONS[w.trade]}
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <Link
          href={`/mon-espace/ateliers/${w.id}`}
          className="font-display text-lg font-bold underline"
        >
          {w.title}
        </Link>
        <p className="text-sm text-ink-muted">
          {WORKSHOP_TRADE_LABELS[w.trade]} · {w.organization.name}
          {w.author ? ` · ${w.author}` : ''} · {w.stepCount} étape{w.stepCount > 1 ? 's' : ''}
        </p>
      </div>
      {w.live && w.status === 'draft' && (
        <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
          En ligne
        </span>
      )}
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${badge[w.status]}`}>
        {WORKSHOP_STATUS_LABELS[w.status]}
      </span>
    </li>
  );
}

/** Ateliers des structures de la personne : à relire d'abord, puis tous les autres. */
export default async function WorkshopsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/ateliers');
  const query = (await searchParams) ?? {};
  const [list, orgs] = await Promise.all([
    apiGet<{ items: WorkshopSummary[] }>(session.accessToken, '/authoring/workshops'),
    apiGet<{ items: Array<{ id: string }> }>(
      session.accessToken,
      '/authoring/workshops/organizations',
    ),
  ]);
  const items = list.ok ? list.data.items : [];
  const toReview = items.filter((w) => w.status === 'review' && w.canPublish);
  const others = items.filter((w) => !toReview.includes(w));
  const canCreate = orgs.ok && orgs.data.items.length > 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Ateliers</h1>
          <p className="text-ink-muted">
            Exercices techniques des élèves : rédigés ici, relus, puis publiés.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/mon-espace/ateliers/nouveau"
            className="inline-flex min-h-[44px] items-center rounded-card bg-primary px-5 font-bold text-surface no-underline hover:bg-primary-dark"
          >
            Créer un atelier
          </Link>
        )}
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {toReview.length > 0 && (
        <div className="rounded-big border border-line bg-surface p-5">
          <h2 className="text-xl font-extrabold">À relire</h2>
          <ul className="divide-y divide-line" data-testid="workshops-review">
            {toReview.map((w) => (
              <Row key={w.id} w={w} />
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-big border border-line bg-surface p-5">
        <h2 className="text-xl font-extrabold">Tous les ateliers</h2>
        {others.length === 0 ? (
          <p className="mt-2 text-ink-muted">Aucun atelier pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="workshops-list">
            {others.map((w) => (
              <Row key={w.id} w={w} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
