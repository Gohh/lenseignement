import { EXERCISE_DOMAIN_LABELS, type ExamRate, type ExamResults } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Résultats de l’épreuve' };

const HOME = '/mon-espace/epreuves';

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-big border border-line bg-surface p-4">
      <p className="text-sm font-bold text-ink-muted">{label}</p>
      <p className="font-display text-3xl font-extrabold">{value}</p>
      <p className="text-sm text-ink-muted">{hint}</p>
    </div>
  );
}

/** Barres horizontales avec le repère du seuil ; le texte dit « sous le seuil », pas la couleur seule. */
function Bars({ rows, threshold }: { rows: ExamRate[]; threshold: number }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-bold">{r.label}</span>
            <span className="text-sm">
              <strong>{r.rate} %</strong>
              <span className="text-ink-muted">
                {' '}
                · {r.count} question{r.count > 1 ? 's' : ''}
                {r.rate < threshold ? ' · sous le seuil' : ''}
              </span>
            </span>
          </div>
          <div
            className="relative mt-1 h-3 rounded-full bg-line"
            role="img"
            aria-label={`${r.label} : ${r.rate} % des points`}
          >
            <div
              className={`h-3 rounded-full ${r.rate < threshold ? 'bg-accent' : 'bg-primary'}`}
              style={{ width: `${Math.max(r.rate, 1)}%` }}
            />
            <div
              className="absolute -top-1 h-5 w-0.5 bg-ink"
              style={{ left: `${threshold}%` }}
              aria-hidden
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function ExamResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/${id}/resultats`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const query = (await searchParams) ?? {};
  const cohort =
    typeof query.classe === 'string' && /^[0-9a-f-]{36}$/i.test(query.classe) ? query.classe : '';
  const res = await apiGet<ExamResults>(
    session.accessToken,
    `/authoring/exams/${id}/results${cohort ? `?cohort=${cohort}` : ''}`,
  );
  if (!res.ok) redirect(`${HOME}?erreur=${encodeURIComponent('Épreuve introuvable.')}`);
  const r = res.data;
  const t = r.exam.threshold;
  const share = r.participants ? Math.round((r.aboveThreshold / r.participants) * 100) : 0;
  const chip = (active: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full border px-4 font-bold no-underline ${
      active
        ? 'border-primary bg-primary text-surface'
        : 'border-line-strong bg-surface text-ink hover:bg-primary-soft'
    }`;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link href={`${HOME}/${id}`} className="inline-flex min-h-[44px] items-center underline">
        ← {r.exam.title}
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold">Résultats</h1>
        <p className="text-ink-muted">
          {r.exam.title} · {r.exam.questionCount} questions · seuil de réussite {t} %
        </p>
      </div>

      {r.cohorts.length > 1 && (
        <nav aria-label="Classe" className="flex flex-wrap gap-2">
          <Link href={`${HOME}/${id}/resultats`} className={chip(!r.cohortId)}>
            Toutes mes classes
          </Link>
          {r.cohorts.map((c) => (
            <Link
              key={c.id}
              href={`${HOME}/${id}/resultats?classe=${c.id}`}
              className={chip(r.cohortId === c.id)}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      {r.participants === 0 ? (
        <p className="rounded-big border border-line bg-surface p-5">
          Aucune copie pour l’instant : les résultats s’affichent dès qu’un élève a rendu l’épreuve.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3" data-testid="exam-kpis">
            <Tile
              label="Ont passé l’épreuve"
              value={`${r.participants} / ${r.expected}`}
              hint="élèves des classes choisies"
            />
            <Tile
              label="Au-dessus du seuil"
              value={`${share} %`}
              hint={`${r.aboveThreshold} élève${r.aboveThreshold > 1 ? 's' : ''} à ${t} % ou plus`}
            />
            <Tile label="Moyenne" value={`${r.average ?? 0} %`} hint="part des points obtenus" />
          </div>

          <section className="space-y-3 rounded-big border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-bold">Par domaine</h2>
            <p className="text-sm text-ink-muted">
              Part des points obtenus. Le trait noir marque le seuil de {t} %.
            </p>
            <Bars rows={r.byDomain} threshold={t} />
          </section>

          <section className="space-y-3 rounded-big border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-bold">Par façon de penser</h2>
            <p className="text-sm text-ink-muted">
              Connaître, appliquer, raisonner : où les élèves bloquent-ils ?
            </p>
            <Bars rows={r.bySkill} threshold={t} />
          </section>

          <section className="space-y-3 rounded-big border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-bold">Question par question</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-sm text-ink-muted">
                  <tr>
                    <th className="py-2 pr-3">N°</th>
                    <th className="py-2 pr-3">Question</th>
                    <th className="py-2 pr-3">Domaine</th>
                    <th className="py-2">Réussite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.byQuestion.map((q) => (
                    <tr key={q.key}>
                      <td className="py-2 pr-3">{q.position}</td>
                      <td className="py-2 pr-3 font-bold">{q.label}</td>
                      <td className="py-2 pr-3 text-sm">{EXERCISE_DOMAIN_LABELS[q.domain]}</td>
                      <td className="py-2">
                        {q.rate} %
                        {q.rate < t ? <span className="text-ink-muted"> · à revoir</span> : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3 rounded-big border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-bold">Élèves sous le seuil</h2>
            {r.below.length === 0 ? (
              <p>Tous les élèves qui ont passé l’épreuve sont au-dessus du seuil.</p>
            ) : (
              <ul className="divide-y divide-line" data-testid="exam-below">
                {r.below.map((l) => (
                  <li key={l.learnerId} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <span className="font-bold">{l.name}</span>{' '}
                      <span className="text-sm text-ink-muted">· {l.cohortName}</span>
                    </span>
                    <span className="font-bold">{l.rate} %</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
