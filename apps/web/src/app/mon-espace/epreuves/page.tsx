import { EXAM_MODEL_INFO, type ExamSummary } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Épreuves' };

const HOME = '/mon-espace/epreuves';

/** Épreuves type PASEC, TIMSS, ENIA de ses structures. */
export default async function ExamsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}`);
  const query = (await searchParams) ?? {};
  const [list, orgs] = await Promise.all([
    apiGet<{ items: ExamSummary[] }>(session.accessToken, '/authoring/exams'),
    apiGet<{ items: Array<{ id: string }> }>(
      session.accessToken,
      '/authoring/exercises/organizations',
    ),
  ]);
  const items = list.ok ? list.data.items : [];
  const canCreate = orgs.ok && orgs.data.items.length > 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Épreuves</h1>
          <p className="max-w-2xl text-ink-muted">
            Des épreuves composées comme les grandes évaluations (PASEC, TIMSS, ENIA) : la
            plateforme tire des exercices publiés de la banque selon la part de chaque domaine. Vous
            la donnez à vos classes, puis vous lisez ce qui est acquis, domaine par domaine.
          </p>
        </div>
        {canCreate && (
          <Link href={`${HOME}/nouvelle`} className={buttonClass}>
            Créer une épreuve
          </Link>
        )}
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {items.length === 0 ? (
        <p className="rounded-big border border-line bg-surface p-5">
          Aucune épreuve pour l’instant.
          {canCreate &&
            ' Il faut d’abord des exercices publiés dans la Fabrique, rangés par domaine.'}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-big border border-line bg-surface px-5">
          {items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <Link href={`${HOME}/${e.id}`} className="font-display text-lg font-bold underline">
                  {e.title}
                </Link>
                <p className="text-sm text-ink-muted">
                  {EXAM_MODEL_INFO[e.model].label} · {e.itemCount} question
                  {e.itemCount > 1 ? 's' : ''} · {e.durationMinutes} min · seuil {e.threshold} %
                </p>
                <p className="text-sm text-ink-muted">
                  {e.organization.name} · {e.curriculum}
                  {e.author ? ` · ${e.author}` : ''}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-bold ${
                  e.classCount ? 'bg-primary-soft text-primary' : 'bg-line text-ink'
                }`}
              >
                {e.classCount
                  ? `${e.classCount} classe${e.classCount > 1 ? 's' : ''} · ${e.submissionCount} copie${e.submissionCount > 1 ? 's' : ''}`
                  : 'Pas encore donnée'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
