import type { CampaignSummary } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { HOME, lastDay, levelName, percent, startDay, StatusPill, zoneLabel } from './parts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campagnes d’évaluation' };

function CampaignList({ items, testId }: { items: CampaignSummary[]; testId: string }) {
  return (
    <ul
      className="divide-y divide-line rounded-big border border-line bg-surface px-5"
      data-testid={testId}
    >
      {items.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1 basis-60">
            <Link href={`${HOME}/${c.id}`} className="font-display text-lg font-bold underline">
              {c.title}
            </Link>
            <p className="text-sm text-ink-muted">
              {zoneLabel(c)} · {levelName(c)} · du {startDay(c)} au {lastDay(c)}
            </p>
            <p className="text-sm text-ink-muted">
              {c.exam.title} · {c.exam.questionCount} questions
            </p>
          </div>
          <span className="text-sm">
            <strong>{percent(c.submitted, c.learners)} %</strong> des élèves ont composé
            <span className="text-ink-muted">
              {' '}
              ({c.submitted} sur {c.learners}, {c.classes} classe{c.classes > 1 ? 's' : ''})
            </span>
          </span>
          <StatusPill status={c.status} />
        </li>
      ))}
    </ul>
  );
}

/** Campagnes d'évaluation de zone : celles qu'on pilote, puis celles de ses classes. */
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}`);
  const query = (await searchParams) ?? {};
  const res = await apiGet<{
    piloted: CampaignSummary[];
    classes: CampaignSummary[];
    canLaunch: boolean;
  }>(session.accessToken, '/authoring/campaigns');
  const { piloted, classes, canLaunch } = res.ok
    ? res.data
    : { piloted: [], classes: [], canLaunch: false };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Campagnes d’évaluation</h1>
          <p className="max-w-2xl text-ink-muted">
            Une même épreuve, passée aux mêmes dates par toutes les classes d’un niveau dans une
            zone. Pendant la campagne, on suit seulement qui a composé ; les notes s’ouvrent à la
            clôture.
          </p>
        </div>
        {canLaunch && (
          <Link href={`${HOME}/nouvelle`} className={buttonClass}>
            Lancer une campagne
          </Link>
        )}
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {canLaunch && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Campagnes que je pilote</h2>
          {piloted.length === 0 ? (
            <p className="rounded-big border border-line bg-surface p-5">
              Aucune campagne pour l’instant. Il faut une épreuve d’au moins quatre questions,
              préparée dans « Épreuves ».
            </p>
          ) : (
            <CampaignList items={piloted} testId="piloted-campaigns" />
          )}
        </div>
      )}
      {(classes.length > 0 || !canLaunch) && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Dans mes classes</h2>
          {classes.length === 0 ? (
            <p className="rounded-big border border-line bg-surface p-5">
              Aucune campagne ne concerne vos classes pour l’instant.
            </p>
          ) : (
            <CampaignList items={classes} testId="class-campaigns" />
          )}
        </div>
      )}
    </section>
  );
}
