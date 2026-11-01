import {
  WORKSHOP_TRADES,
  WORKSHOP_TRADE_ICONS,
  WORKSHOP_TRADE_LABELS,
  type WorkshopCard,
  type WorkshopProgress,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Atelier' };

const PROGRESS: Record<WorkshopProgress, { label: string; className: string; action: string }> = {
  todo: { label: 'À faire', className: 'bg-line text-ink-muted', action: 'Commencer' },
  retry: { label: 'À revoir', className: 'bg-accent-soft text-accent-ink', action: 'Continuer' },
  passed: { label: '✓ Réussi', className: 'bg-primary-soft text-primary', action: 'Revoir' },
  practice: {
    label: '✓ Séance pratique demandée',
    className: 'bg-primary-soft text-primary',
    action: 'Revoir',
  },
};

const chip =
  'inline-flex min-h-[44px] items-center gap-1 rounded-full border px-4 font-bold no-underline';

/** Catalogue des ateliers de l'élève, rangés par métier, avec son avancement. */
export default async function WorkshopCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/atelier');
  const query = (await searchParams) ?? {};
  const trade = typeof query.metier === 'string' ? query.metier : null;

  const list = await apiGet<{ items: WorkshopCard[] }>(session.accessToken, '/me/workshops');
  const items = list.ok ? list.data.items : [];
  const trades = WORKSHOP_TRADES.filter((t) => items.some((w) => w.trade === t));
  const shown = trade ? items.filter((w) => w.trade === trade) : items;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold">Atelier</h1>
        <p className="text-ink-muted">
          Entraîne-toi sans danger aux gestes de ton métier. La pratique réelle se fait toujours
          avec ton formateur.
        </p>
      </div>

      {!list.ok && <p>Les ateliers sont momentanément indisponibles. Réessaie plus tard.</p>}
      {list.ok && items.length === 0 && (
        <p className="rounded-card border border-line bg-surface p-6">
          Aucun atelier n’est encore publié. Ton établissement les ajoutera bientôt.
        </p>
      )}

      {trades.length > 1 && (
        <nav aria-label="Métiers" className="flex flex-wrap gap-2">
          <Link
            href="/mon-espace/atelier"
            aria-current={trade === null ? 'page' : undefined}
            className={`${chip} ${trade === null ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink'}`}
          >
            Tous
          </Link>
          {trades.map((t) => (
            <Link
              key={t}
              href={`/mon-espace/atelier?metier=${t}`}
              aria-current={trade === t ? 'page' : undefined}
              className={`${chip} ${trade === t ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink'}`}
            >
              <span aria-hidden="true">{WORKSHOP_TRADE_ICONS[t]}</span> {WORKSHOP_TRADE_LABELS[t]}
            </Link>
          ))}
        </nav>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="workshop-catalog">
        {shown.map((w) => {
          const progress = PROGRESS[w.progress];
          return (
            <li
              key={w.code}
              className="flex flex-col gap-3 rounded-big border border-line bg-surface p-5"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 place-items-center rounded-card bg-primary-soft text-2xl"
                >
                  {WORKSHOP_TRADE_ICONS[w.trade]}
                </span>
                <span className="text-sm font-bold text-ink-muted">
                  {WORKSHOP_TRADE_LABELS[w.trade]}
                </span>
              </div>
              <h2 className="font-display text-xl font-bold leading-tight">{w.title}</h2>
              {w.summary && <p className="text-ink-muted">{w.summary}</p>}
              <p className="text-sm text-ink-muted">
                {w.stepCount} étape{w.stepCount > 1 ? 's' : ''}
                {w.practice ? ' · puis séance pratique avec le formateur' : ''}
              </p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${progress.className}`}>
                  {progress.label}
                </span>
                <Link
                  href={`/mon-espace/atelier/${encodeURIComponent(w.code)}`}
                  className="inline-flex min-h-[44px] items-center rounded-card bg-primary px-5 font-bold text-surface no-underline hover:bg-primary-dark"
                >
                  {progress.action}
                  <span className="sr-only"> « {w.title} »</span>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
