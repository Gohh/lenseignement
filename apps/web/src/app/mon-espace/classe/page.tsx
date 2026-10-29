import type { ClassSessionItem } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet, type CohortSummary } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { createSessionAction, deleteSessionAction, updateSessionAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma classe' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
// La Côte d'Ivoire est à l'heure de Greenwich toute l'année.
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const JOIN_EARLY_MS = 15 * 60_000;

function When({ s }: { s: ClassSessionItem }) {
  return <>{dateFormat.format(new Date(s.startsAt))}</>;
}

export default async function ClassPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/classe');
  const query = await searchParams;
  const [result, cohorts] = await Promise.all([
    apiGet<{ items: ClassSessionItem[] }>(session.accessToken, '/me/class-sessions'),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
  ]);
  const items = result.ok ? result.data.items : [];
  const now = Date.now();
  const upcoming = items.filter((s) => new Date(s.endsAt).getTime() >= now);
  const past = items.filter((s) => new Date(s.endsAt).getTime() < now).reverse();
  const teaching = cohorts.ok ? cohorts.data : [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Ma classe</h1>
        {teaching.length > 0 && (
          <Dialog
            label="+ Programmer une séance"
            title="Programmer une séance"
            primary
            openAtStart={param(query.ouvrir as string | undefined) === 'seance'}
          >
            <form action={createSessionAction} className="space-y-4">
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
                Titre de la séance
                <input name="title" className={inputClass} required maxLength={120} />
              </label>
              <label className="block font-bold">
                Matière (facultatif)
                <input name="subject" className={inputClass} maxLength={60} />
              </label>
              <label className="block font-bold">
                Date et heure
                <input name="startsAt" type="datetime-local" className={inputClass} required />
              </label>
              <label className="block font-bold">
                Durée (minutes)
                <input
                  name="durationMinutes"
                  type="number"
                  className={inputClass}
                  required
                  min={15}
                  max={240}
                  defaultValue={45}
                />
              </label>
              <button type="submit" className={buttonClass}>
                Programmer
              </button>
            </form>
          </Dialog>
        )}
      </div>
      <p>Les séances en visio de ta classe : date, heure et bouton pour rejoindre.</p>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />

      <div className={cardClass}>
        <h2 className="text-xl font-bold">À venir</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2">Aucune séance prévue pour le moment.</p>
        ) : (
          <ul className="mt-3 space-y-4" role="list" data-testid="upcoming-sessions">
            {upcoming.map((s) => {
              const open =
                now >= new Date(s.startsAt).getTime() - JOIN_EARLY_MS &&
                now <= new Date(s.endsAt).getTime();
              return (
                <li key={s.id} className="rounded-card border border-line p-4">
                  <p className="text-lg font-bold">
                    {s.title}
                    {s.subject ? ` · ${s.subject}` : ''}
                  </p>
                  <p className="text-ink-muted">
                    <When s={s} /> · {s.cohortName}
                    {s.teacherName ? ` · ${s.teacherName}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {open ? (
                      <a
                        href={s.joinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass}
                      >
                        Rejoindre la séance
                        <span className="sr-only">
                          {' '}
                          « {s.title} » (s’ouvre dans un nouvel onglet)
                        </span>
                      </a>
                    ) : (
                      <p className="font-bold text-ink-muted">
                        Le bouton « Rejoindre » s’ouvre 15 minutes avant l’heure.
                      </p>
                    )}
                    {s.canManage && (
                      <form action={deleteSessionAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className={secondaryButtonClass}>
                          Annuler la séance<span className="sr-only"> « {s.title} »</span>
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {past.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Séances passées</h2>
          <ul className="mt-3 space-y-4" role="list" data-testid="past-sessions">
            {past.map((s) => (
              <li key={s.id} className="rounded-card border border-line p-4">
                <p className="text-lg font-bold">
                  {s.title}
                  {s.subject ? ` · ${s.subject}` : ''}
                </p>
                <p className="text-ink-muted">
                  <When s={s} /> · {s.cohortName}
                </p>
                {s.summary && <p className="mt-2 whitespace-pre-line">{s.summary}</p>}
                {s.resourceUrl && (
                  <p className="mt-2">
                    <a
                      href={s.resourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center font-bold underline"
                    >
                      Support de la séance<span className="sr-only"> « {s.title} »</span>
                    </a>
                  </p>
                )}
                {s.canManage && (
                  <form action={updateSessionAction} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={s.id} />
                    <label className="block font-bold">
                      Résumé de la séance
                      <textarea
                        name="summary"
                        rows={3}
                        maxLength={2000}
                        defaultValue={s.summary ?? ''}
                        className={inputClass}
                      />
                    </label>
                    <label className="block font-bold">
                      Lien du support (facultatif)
                      <input
                        name="resourceUrl"
                        type="url"
                        maxLength={500}
                        defaultValue={s.resourceUrl ?? ''}
                        className={inputClass}
                      />
                    </label>
                    <button type="submit" className={secondaryButtonClass}>
                      Enregistrer<span className="sr-only"> pour « {s.title} »</span>
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
