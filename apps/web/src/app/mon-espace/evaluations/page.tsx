import { weightedAverage, type EvaluationItem } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet, type CohortSummary } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { createEvaluationAction, deleteEvaluationAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Évaluations' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export default async function EvaluationsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/evaluations');
  const query = await searchParams;
  const [result, cohorts] = await Promise.all([
    apiGet<{ items: EvaluationItem[] }>(session.accessToken, '/me/evaluations'),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
  ]);
  const items = result.ok ? result.data.items : [];
  const teaching = cohorts.ok ? cohorts.data : [];
  const given = items.filter((e) => e.canManage);
  const mine = items.filter((e) => !e.canManage);
  const average = weightedAverage(mine);
  const day = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Évaluations</h1>
        {teaching.length > 0 && (
          <Dialog
            label="+ Créer une évaluation"
            title="Créer une évaluation"
            primary
            openAtStart={param(query.ouvrir as string | undefined) === 'evaluation'}
          >
            <form action={createEvaluationAction} className="space-y-4">
              <label className="block font-bold">
                Classe
                <select name="cohortId" className={inputClass} required>
                  {teaching.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.organization.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Titre
                <input name="title" className={inputClass} required maxLength={120} />
              </label>
              <label className="block font-bold">
                Matière (facultatif)
                <input name="subject" className={inputClass} maxLength={60} />
              </label>
              <label className="block font-bold">
                Date
                <input name="heldOn" type="date" className={inputClass} required />
              </label>
              <label className="block font-bold">
                Note sur
                <input
                  name="maxScore"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={20}
                  className={inputClass}
                  required
                />
              </label>
              <label className="block font-bold">
                Coefficient
                <input
                  name="coefficient"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={1}
                  className={inputClass}
                  required
                />
              </label>
              <button type="submit" className={buttonClass}>
                Créer l’évaluation
              </button>
            </form>
          </Dialog>
        )}
      </div>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />

      {given.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Évaluations de mes classes</h2>
          <ul className="mt-3 space-y-3" role="list" data-testid="given-evaluations">
            {given.map((e) => (
              <li key={e.id} className="rounded-card border border-line p-4">
                <p className="text-lg font-bold">{e.title}</p>
                <p className="text-ink-muted">
                  {e.cohortName} · {day(e.heldOn)} · sur {e.maxScore} · coefficient {e.coefficient}{' '}
                  · {e.scoredCount} note{e.scoredCount > 1 ? 's' : ''} sur {e.learnerCount}
                  {e.classAverage !== null ? ` · moyenne ${number.format(e.classAverage)}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link href={`/mon-espace/evaluations/${e.id}`} className={buttonClass}>
                    Saisir les notes<span className="sr-only"> de « {e.title} »</span>
                  </Link>
                  <form action={deleteEvaluationAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className={secondaryButtonClass}>
                      Supprimer<span className="sr-only"> « {e.title} »</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(mine.length > 0 || given.length === 0) && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Mes notes</h2>
          {average !== null && (
            <p className="mt-2 text-lg" data-testid="average">
              Ma moyenne : <strong>{number.format(average)} sur 20</strong>
            </p>
          )}
          {mine.length === 0 ? (
            <p className="mt-2">Aucune évaluation pour le moment.</p>
          ) : (
            <ul className="mt-3 space-y-3" role="list" data-testid="my-evaluations">
              {mine.map((e) => (
                <li key={e.id} className="rounded-card border border-line p-4">
                  <p className="text-lg font-bold">{e.title}</p>
                  <p className="text-ink-muted">
                    {e.subject ? `${e.subject} · ` : ''}
                    {day(e.heldOn)} · coefficient {e.coefficient}
                  </p>
                  {e.myScore !== null ? (
                    <p className="mt-1" data-testid="my-score">
                      Note : <strong>{number.format(e.myScore)}</strong> sur {e.maxScore}
                      {e.classAverage !== null
                        ? ` · moyenne de la classe : ${number.format(e.classAverage)}`
                        : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-ink-muted">Pas encore noté.</p>
                  )}
                  {e.myComment && <p className="whitespace-pre-line">{e.myComment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
