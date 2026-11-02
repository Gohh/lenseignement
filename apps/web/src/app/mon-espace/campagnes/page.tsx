import {
  ORAL_SUBJECT_LABELS,
  type CampaignSummary,
  type OralCampaignList,
  type OralCampaignSummary,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
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

function OralList({ items, testId }: { items: OralCampaignSummary[]; testId: string }) {
  return (
    <ul
      className="divide-y divide-line rounded-big border border-line bg-surface px-5"
      data-testid={testId}
    >
      {items.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1 basis-60">
            <Link
              href={`${HOME}/orale/${c.id}`}
              className="font-display text-lg font-bold underline"
            >
              {c.title}
            </Link>
            <p className="text-sm text-ink-muted">
              {zoneLabel(c)} · {levelName(c)} · du {startDay(c)} au {lastDay(c)}
            </p>
            <p className="text-sm text-ink-muted">
              Épreuve orale · {ORAL_SUBJECT_LABELS[c.test.subject]} · {c.test.title}
            </p>
          </div>
          <span className="text-sm">
            <strong>{percent(c.evaluated, c.learners)} %</strong> des élèves évalués
            <span className="text-ink-muted">
              {' '}
              ({c.evaluated} sur {c.learners}, {c.classes} classe{c.classes > 1 ? 's' : ''})
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
  const oralRes = await apiGet<OralCampaignList>(session.accessToken, '/oral/campaigns');
  const oral: OralCampaignList = oralRes.ok
    ? oralRes.data
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
          <div className="flex flex-wrap gap-2">
            <Link href={`${HOME}/nouvelle?type=orale`} className={secondaryButtonClass}>
              Lancer une campagne orale
            </Link>
            <Link href={`${HOME}/nouvelle`} className={buttonClass}>
              Lancer une campagne
            </Link>
          </div>
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
      {(oral.piloted.length > 0 || oral.classes.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Campagnes orales</h2>
          <p className="max-w-2xl text-sm text-ink-muted">
            Une épreuve orale chronométrée (lecture, calcul) passée élève par élève par les
            enseignants, dans toutes les classes du niveau. Les chiffres de la zone s’ouvrent à la
            clôture.
          </p>
          {oral.piloted.length > 0 && (
            <OralList items={oral.piloted} testId="piloted-oral-campaigns" />
          )}
          {oral.classes.length > 0 && (
            <OralList items={oral.classes} testId="class-oral-campaigns" />
          )}
        </div>
      )}
    </section>
  );
}
