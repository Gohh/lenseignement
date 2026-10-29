import type { AssignmentItem } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet, type CohortSummary } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { createAssignmentAction, deleteAssignmentAction, submitAssignmentAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Devoirs' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export default async function AssignmentsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/devoirs');
  const query = await searchParams;
  const [result, cohorts] = await Promise.all([
    apiGet<{ items: AssignmentItem[] }>(session.accessToken, '/me/assignments'),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
  ]);
  const items = result.ok ? result.data.items : [];
  const teaching = cohorts.ok ? cohorts.data : [];
  const mineToDo = items.filter((a) => !a.canManage);
  const toCorrect = items.filter((a) => a.canManage);
  const now = Date.now();

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Devoirs</h1>
        {teaching.length > 0 && (
          <Dialog
            label="+ Donner un devoir"
            title="Donner un devoir"
            primary
            openAtStart={param(query.ouvrir as string | undefined) === 'devoir'}
          >
            <form action={createAssignmentAction} className="space-y-4">
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
                Titre du devoir
                <input name="title" className={inputClass} required maxLength={120} />
              </label>
              <label className="block font-bold">
                Consigne
                <textarea
                  name="instructions"
                  rows={4}
                  className={inputClass}
                  required
                  maxLength={4000}
                />
              </label>
              <label className="block font-bold">
                À rendre avant (facultatif)
                <input name="dueAt" type="datetime-local" className={inputClass} />
              </label>
              <label className="block font-bold">
                Note sur
                <input
                  name="maxScore"
                  type="number"
                  className={inputClass}
                  min={1}
                  max={100}
                  defaultValue={20}
                  required
                />
              </label>
              <button type="submit" className={buttonClass}>
                Donner le devoir
              </button>
            </form>
          </Dialog>
        )}
      </div>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />

      {toCorrect.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Devoirs donnés</h2>
          <ul className="mt-3 space-y-3" role="list" data-testid="given-assignments">
            {toCorrect.map((a) => (
              <li key={a.id} className="rounded-card border border-line p-4">
                <p className="text-lg font-bold">{a.title}</p>
                <p className="text-ink-muted">
                  {a.cohortName}
                  {a.dueAt
                    ? ` · à rendre avant le ${dateFormat.format(new Date(a.dueAt))}`
                    : ''} · {a.submittedCount} copie{a.submittedCount > 1 ? 's' : ''} sur{' '}
                  {a.learnerCount} · {a.gradedCount} corrigée{a.gradedCount > 1 ? 's' : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link href={`/mon-espace/devoirs/${a.id}`} className={buttonClass}>
                    Corriger<span className="sr-only"> « {a.title} »</span>
                  </Link>
                  <form action={deleteAssignmentAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className={secondaryButtonClass}>
                      Supprimer<span className="sr-only"> « {a.title} »</span>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(mineToDo.length > 0 || toCorrect.length === 0) && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Mes devoirs</h2>
          {mineToDo.length === 0 ? (
            <p className="mt-2">Aucun devoir pour le moment.</p>
          ) : (
            <ul className="mt-3 space-y-4" role="list" data-testid="my-assignments">
              {mineToDo.map((a) => {
                const late = a.dueAt && new Date(a.dueAt).getTime() < now && !a.mine;
                return (
                  <li key={a.id} className="rounded-card border border-line p-4">
                    <p className="text-lg font-bold">{a.title}</p>
                    <p className="text-ink-muted">
                      {a.cohortName}
                      {a.teacherName ? ` · ${a.teacherName}` : ''}
                      {a.dueAt
                        ? ` · à rendre avant le ${dateFormat.format(new Date(a.dueAt))}`
                        : ''}
                      {late ? ' · en retard' : ''}
                    </p>
                    <p className="mt-2 whitespace-pre-line">{a.instructions}</p>
                    {a.mine?.score != null ? (
                      <div className="mt-3 rounded-card border-l-4 border-primary bg-primary-soft p-3">
                        <p className="text-lg font-bold" data-testid="grade">
                          Note : {a.mine.score}/{a.maxScore}
                        </p>
                        {a.mine.comment && <p className="whitespace-pre-line">{a.mine.comment}</p>}
                        <p className="mt-1 whitespace-pre-line text-ink-muted">
                          Ta copie : {a.mine.body}
                        </p>
                      </div>
                    ) : (
                      <form action={submitAssignmentAction} className="mt-3 space-y-2">
                        <input type="hidden" name="id" value={a.id} />
                        <label className="block font-bold">
                          Ma réponse
                          <textarea
                            name="body"
                            rows={4}
                            required
                            maxLength={8000}
                            defaultValue={a.mine?.body ?? ''}
                            className={inputClass}
                          />
                        </label>
                        <button type="submit" className={buttonClass}>
                          {a.mine ? 'Modifier ma copie' : 'Rendre mon devoir'}
                          <span className="sr-only"> « {a.title} »</span>
                        </button>
                        {a.mine && (
                          <p className="text-ink-muted">Rendu, en attente de correction.</p>
                        )}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
