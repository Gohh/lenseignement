import {
  BRANCHES,
  PILOT_CYCLE_LABELS,
  PILOT_CYCLES,
  PILOT_PERIOD_LABELS,
  PILOT_PERIODS,
  type MaskedCount,
  type MaskedPercent,
  type PilotFigure,
  type PilotOverview,
  type PilotState,
  type StatsOverview,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tableau de pilotage' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5';
const smallCard = 'space-y-3 rounded-card border border-line bg-surface p-4';
const buttonOutline =
  'inline-flex min-h-[44px] items-center rounded-full border border-primary bg-surface px-5 font-bold text-primary no-underline hover:bg-primary-soft';
const buttonFull =
  'inline-flex min-h-[44px] items-center rounded-full bg-primary px-5 font-bold text-surface no-underline hover:bg-primary-dark';

const count = (n: MaskedCount) => (n === null ? 'moins de 5' : n.toLocaleString('fr-FR'));
const rate = (p: MaskedPercent) => (p === null ? 'pas assez de personnes' : `${p} %`);
const shortRate = (p: MaskedPercent) => (p === null ? '–' : `${p} %`);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATE: Record<
  PilotState,
  { label: string; icon: string; pill: string; dot: string; edge: string }
> = {
  alert: {
    label: 'En alerte',
    icon: '!',
    pill: 'bg-[#fbe6e6] text-[#a52a32]',
    dot: 'bg-[#d03b3b] text-white',
    edge: 'border-l-[#d03b3b]',
  },
  watch: {
    label: 'À surveiller',
    icon: '–',
    pill: 'bg-[#fff4dc] text-[#6b4a00]',
    dot: 'bg-[#fab219] text-[#0b0b0b]',
    edge: 'border-l-[#fab219]',
  },
  ok: {
    label: 'Bon',
    icon: '✓',
    pill: 'bg-[#e7f6e7] text-[#006300]',
    dot: 'bg-[#0ca30c] text-white',
    edge: 'border-l-[#0ca30c]',
  },
};

function StatePill({ state, label }: { state: PilotState; label?: string }) {
  const s = STATE[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-3 text-sm font-bold ${s.pill}`}
    >
      <span
        aria-hidden="true"
        className={`inline-grid h-[18px] w-[18px] place-items-center rounded-full text-xs ${s.dot}`}
      >
        {s.icon}
      </span>
      {label ?? s.label}
    </span>
  );
}

function Figures({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className="text-right font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Évolution d'un chiffre clé : en nombre (pourcentage de variation) ou en points. */
function Delta({ figure, unit }: { figure: PilotFigure; unit: 'count' | 'points' }) {
  const { value, previous } = figure;
  if (value === null || previous === null) {
    return <p className="text-sm text-ink-muted">Pas de comparaison possible</p>;
  }
  const diff =
    unit === 'points'
      ? value - previous
      : previous === 0
        ? null
        : Math.round(((value - previous) / previous) * 100);
  if (diff === null) return <p className="text-sm text-ink-muted">Nouveau sur la période</p>;
  const text =
    unit === 'points'
      ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)} point${Math.abs(diff) > 1 ? 's' : ''}`
      : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)} %`;
  const color = diff > 0 ? 'text-[#006300]' : diff < 0 ? 'text-[#a52a32]' : 'text-ink-muted';
  return (
    <p className={`text-sm font-bold ${color}`}>
      <span aria-hidden="true">{diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '= '}</span>
      {text}
      <span className="block font-normal text-ink-muted">par rapport à la période d’avant</span>
    </p>
  );
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Courbe des apprenants actifs par semaine : une seule série, le dernier point mis en valeur. */
function WeeklyChart({ weekly }: { weekly: PilotOverview['weekly'] }) {
  const W = 720,
    H = 240,
    L = 48,
    R = 16,
    T = 18,
    B = 28;
  const values = weekly.map((w) => w.active ?? 0);
  const top = Math.max(10, ...values);
  const step = 10 ** Math.floor(Math.log10(top));
  const max = Math.ceil(top / step) * step;
  const ticks = [0, max / 2, max];
  const x = (i: number) => L + (i * (W - L - R)) / (weekly.length - 1);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = weekly.length - 1;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Apprenants actifs par semaine, de ${count(weekly[0]!.active)} la semaine du ${shortDate(weekly[0]!.week)} à ${count(weekly[last]!.active)} la semaine du ${shortDate(weekly[last]!.week)}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={L}
            x2={W - R}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? '#c3c2b7' : '#eceee9'}
            strokeWidth="1"
          />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#4a5a6e">
            {t.toLocaleString('fr-FR')}
          </text>
        </g>
      ))}
      {weekly.map((w, i) =>
        (last - i) % 2 === 0 ? (
          <text
            key={w.week}
            x={x(i)}
            y={H - 8}
            textAnchor={i === last ? 'end' : 'middle'}
            fontSize="12"
            fill="#4a5a6e"
          >
            {shortDate(w.week)}
          </text>
        ) : null,
      )}
      <polygon
        points={`${x(0)},${y(0)} ${points} ${x(last)},${y(0)}`}
        fill="#146b46"
        fillOpacity="0.1"
      />
      <polyline
        points={points}
        fill="none"
        stroke="#146b46"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {weekly.map((w, i) => (
        <g key={w.week}>
          <rect
            x={x(i) - (W - L - R) / (weekly.length - 1) / 2}
            y={T}
            width={(W - L - R) / (weekly.length - 1)}
            height={H - T - B}
            fill="transparent"
          >
            <title>{`Semaine du ${shortDate(w.week)} : ${count(w.active)} actifs`}</title>
          </rect>
        </g>
      ))}
      <circle
        cx={x(last)}
        cy={y(values[last]!)}
        r="5"
        fill="#146b46"
        stroke="#fff"
        strokeWidth="2"
      />
      <text
        x={x(last) - 10}
        y={y(values[last]!) - 12}
        textAnchor="end"
        fontSize="14"
        fontWeight="700"
        fill="#10301f"
      >
        {count(weekly[last]!.active)}
      </text>
    </svg>
  );
}

/**
 * Tableau de pilotage (ADR-016) : chacun pour sa zone (établissement, IEPP, DRENA ou tout le
 * pays). Aucun nom d'élève ; un groupe de 1 à 4 personnes est affiché « moins de 5 ».
 */
export default async function StatsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/statistiques');
  const query = await searchParams;
  const zone = one(query.zone);
  const cycle = one(query.cycle);
  const periode = one(query.periode);
  const params = new URLSearchParams();
  if (zone) params.set('zone', zone);
  if (cycle && (PILOT_CYCLES as readonly string[]).includes(cycle)) params.set('cycle', cycle);
  if (periode && (PILOT_PERIODS as readonly string[]).includes(periode))
    params.set('periode', periode);
  const qs = params.toString();
  const [pilot, stats] = await Promise.all([
    apiGet<PilotOverview>(session.accessToken, `/stats/pilotage${qs ? `?${qs}` : ''}`),
    apiGet<StatsOverview>(session.accessToken, '/stats/overview'),
  ]);

  /** Lien vers le tableau avec un réglage changé. */
  const link = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return `/mon-espace/statistiques${s ? `?${s}` : ''}`;
  };

  if (!pilot.ok || !stats.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Tableau de pilotage</h1>
        <p>Ce tableau ne fait pas partie de vos droits.</p>
      </section>
    );
  }
  const d = pilot.data;
  const period = d.period;
  const funnel: Array<[string, MaskedCount, string]> = [
    ['Inscrits à un cours', d.funnel.enrolled, '#7cc39b'],
    ['Ont commencé', d.funnel.started, '#4ea476'],
    ['À mi-parcours', d.funnel.halfway, '#2a8558'],
    ['Ont terminé', d.funnel.completed, '#146b46'],
  ];
  const base = d.funnel.enrolled ?? 0;
  const subZones = d.rows.length > 0;

  return (
    <section className="space-y-5" data-testid="pilotage">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="font-bold text-ink-muted">Piloter / Statistiques</p>
          <h1 className="text-4xl font-extrabold">Tableau de pilotage</h1>
          <p className="max-w-prose text-ink-muted">
            Les chiffres de votre zone, sans aucun nom d’élève. Un groupe de moins de {d.threshold}{' '}
            personnes s’affiche « moins de {d.threshold} », pour que personne ne soit reconnu.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 print:hidden">
          <PrintButton className={buttonOutline} />
          <a href={`/mon-espace/statistiques/export${qs ? `?${qs}` : ''}`} className={buttonFull}>
            Exporter en tableur
          </a>
        </div>
      </div>

      <form
        method="get"
        action="/mon-espace/statistiques"
        className={`${cardClass} flex flex-wrap items-end gap-4 print:hidden`}
        aria-label="Filtres"
      >
        <input type="hidden" name="periode" value={period} />
        {d.zoneOptions.length > 1 && (
          <label className="grid gap-1 text-sm font-bold text-ink-muted" htmlFor="filtre-zone">
            Zone
            <select
              id="filtre-zone"
              name="zone"
              defaultValue={d.zone.id ?? ''}
              className="min-h-[44px] rounded-card border border-line bg-surface px-3 text-base text-ink"
            >
              <option value="">
                {d.zone.path[0]?.id === null ? 'Tout le pays' : 'Toute ma zone'}
              </option>
              {d.zoneOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {d.zoneOptions.length <= 1 && d.zone.id && (
          <input type="hidden" name="zone" value={d.zone.id} />
        )}
        <label className="grid gap-1 text-sm font-bold text-ink-muted" htmlFor="filtre-cycle">
          Cycle
          <select
            id="filtre-cycle"
            name="cycle"
            defaultValue={d.cycle ?? ''}
            className="min-h-[44px] rounded-card border border-line bg-surface px-3 text-base text-ink"
          >
            <option value="">Tous les cycles</option>
            {PILOT_CYCLES.map((c) => (
              <option key={c} value={c}>
                {PILOT_CYCLE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonOutline}>
          Afficher
        </button>
        <div className="grid gap-1">
          <span className="text-sm font-bold text-ink-muted" id="filtre-periode">
            Période
          </span>
          <nav
            aria-labelledby="filtre-periode"
            className="flex flex-wrap overflow-hidden rounded-card border border-line"
          >
            {PILOT_PERIODS.map((p) => (
              <Link
                key={p}
                href={link({ periode: p })}
                aria-current={p === period ? 'true' : undefined}
                className={`inline-flex min-h-[44px] items-center border-line px-4 font-bold no-underline [&:not(:first-child)]:border-l ${
                  p === period
                    ? 'bg-primary text-surface'
                    : 'bg-surface text-ink hover:bg-primary-soft'
                }`}
              >
                {PILOT_PERIOD_LABELS[p]}
              </Link>
            ))}
          </nav>
        </div>
      </form>

      <nav
        aria-label="Zone affichée"
        className="flex flex-wrap items-center gap-2 font-bold"
        data-testid="stats-zone"
      >
        {d.zone.path.map((p, i) => (
          <span key={p.id ?? 'pays'} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-ink-muted">
                ›
              </span>
            )}
            {i < d.zone.path.length - 1 ? (
              <Link
                href={link({ zone: p.id })}
                className="inline-flex min-h-[44px] items-center underline"
              >
                {p.name}
              </Link>
            ) : (
              <span aria-current="page">{p.name}</span>
            )}
          </span>
        ))}
        {d.zone.path.length === 0 && <span>{d.zone.name}</span>}
        {d.cycle && (
          <span className="font-normal text-ink-muted">· {PILOT_CYCLE_LABELS[d.cycle]}</span>
        )}
      </nav>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="list" data-testid="pilot-kpis">
        {(
          [
            ['Apprenants actifs', d.kpis.active, 'count'],
            ['Cours terminés', d.kpis.completionRate, 'points'],
            ['Devoirs rendus à temps', d.kpis.assignmentsRate, 'points'],
            ['Réussite aux quiz', d.kpis.quizSuccess, 'points'],
          ] as const
        ).map(([label, figure, unit]) => (
          <li key={label} className={`${cardClass} space-y-1`}>
            <p className="font-bold text-ink-muted">{label}</p>
            <p className="text-4xl font-bold text-ink-strong">
              {figure.value === null
                ? unit === 'count'
                  ? 'moins de 5'
                  : '–'
                : unit === 'count'
                  ? figure.value.toLocaleString('fr-FR')
                  : `${figure.value} %`}
            </p>
            {figure.value === null && unit === 'points' ? (
              <p className="text-sm text-ink-muted">Pas assez de personnes</p>
            ) : (
              <Delta figure={figure} unit={unit} />
            )}
          </li>
        ))}
      </ul>

      <p
        className={`${cardClass} flex flex-wrap gap-x-7 gap-y-2 py-3 text-ink-muted`}
        data-testid="pilot-coverage"
      >
        <span>
          <b className="text-lg text-ink-strong">
            {d.coverage.establishments.toLocaleString('fr-FR')}
          </b>{' '}
          établissements
        </span>
        <span>
          <b className="text-lg text-ink-strong">{d.coverage.classes.toLocaleString('fr-FR')}</b>{' '}
          classes
        </span>
        <span>
          <b className="text-lg text-ink-strong">{d.coverage.teachers.toLocaleString('fr-FR')}</b>{' '}
          enseignants
        </span>
        <span>
          <b className="text-lg text-ink-strong">{count(d.coverage.learners)}</b> apprenants
        </span>
        <span>
          <b className="text-lg text-ink-strong">
            {d.coverage.publishedCourses.toLocaleString('fr-FR')}
          </b>{' '}
          cours publiés
        </span>
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className={cardClass} aria-labelledby="titre-semaines">
          <h2 id="titre-semaines" className="text-xl font-bold">
            Apprenants actifs chaque semaine
          </h2>
          <p className="mb-3 text-sm text-ink-muted">
            Une personne compte une fois par semaine si elle a ouvert une leçon, un quiz ou un
            devoir.
          </p>
          <WeeklyChart weekly={d.weekly} />
          <details className="mt-2">
            <summary className="inline-flex min-h-[44px] cursor-pointer items-center font-bold text-primary">
              Voir les chiffres en tableau
            </summary>
            <table className="w-full tabular-nums">
              <thead>
                <tr className="text-left text-sm text-ink-muted">
                  <th className="py-1">Semaine du</th>
                  <th className="py-1 text-right">Apprenants actifs</th>
                </tr>
              </thead>
              <tbody>
                {d.weekly.map((w) => (
                  <tr key={w.week} className="border-t border-line">
                    <td className="py-1">{shortDate(w.week)}</td>
                    <td className="py-1 text-right">{count(w.active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section className={cardClass} aria-labelledby="titre-parcours" data-testid="pilot-funnel">
          <h2 id="titre-parcours" className="text-xl font-bold">
            Où en sont les apprenants
          </h2>
          <p className="mb-3 text-sm text-ink-muted">
            Depuis l’inscription à un cours jusqu’à la dernière leçon.
          </p>
          <ol className="space-y-4">
            {funnel.map(([label, value, color]) => {
              const share = value !== null && base > 0 ? Math.round((100 * value) / base) : null;
              return (
                <li key={label} className="space-y-1">
                  <p className="flex justify-between gap-3 font-bold">
                    <span>{label}</span>
                    <span className="tabular-nums">
                      {count(value)}
                      {share !== null && label !== 'Inscrits à un cours' ? ` · ${share} %` : ''}
                    </span>
                  </p>
                  <div className="h-5 rounded-r-md bg-primary-soft">
                    <div
                      className="h-5 rounded-r-md"
                      style={{
                        width: `${value === null ? 0 : base > 0 ? (100 * value) / base : 0}%`,
                        background: color,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section className={cardClass} aria-labelledby="titre-zones" data-testid="pilot-rows">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="titre-zones" className="text-xl font-bold">
            {d.rows.some((r) => r.type === 'authority')
              ? 'Comparaison des DRENA'
              : 'Comparaison des établissements'}
          </h2>
          {subZones && (
            <p className="text-sm text-ink-muted">
              Les zones qui ont besoin d’aide d’abord. Cliquez sur un nom pour voir le détail.
            </p>
          )}
        </div>
        {subZones ? (
          <>
            <div
              className="mt-3 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Comparaison des zones (faites défiler)"
            >
              <table className="w-full min-w-[46rem] text-left tabular-nums">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-2 py-2">Zone</th>
                    <th className="px-2 py-2 text-right">Apprenants</th>
                    <th className="px-2 py-2">Actifs sur la période</th>
                    <th className="px-2 py-2 text-right">Cours terminés</th>
                    <th className="px-2 py-2 text-right">Devoirs rendus</th>
                    <th className="px-2 py-2">État</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id} className="border-b border-line">
                      <td className="px-2 py-2">
                        {r.opens ? (
                          <Link
                            href={link({ zone: r.id })}
                            className="font-bold text-ink-strong underline"
                          >
                            {r.name}
                          </Link>
                        ) : (
                          <span className="font-bold text-ink-strong">{r.name}</span>
                        )}
                        {r.type === 'authority' && (
                          <span className="block text-sm text-ink-muted">
                            {r.establishments} établissement{r.establishments > 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{count(r.learners)}</td>
                      <td className="px-2 py-2">
                        <div className="flex min-w-[11rem] items-center gap-2">
                          <div className="relative h-2.5 flex-1 rounded-r bg-primary-soft">
                            <div
                              className="h-2.5 rounded-r bg-primary"
                              style={{ width: `${r.activeRate ?? 0}%` }}
                            />
                            {d.averageActiveRate !== null && (
                              <div
                                className="absolute -top-1 h-[18px] w-0.5 bg-ink"
                                style={{ left: `${d.averageActiveRate}%` }}
                                title={`Moyenne de la zone : ${d.averageActiveRate} %`}
                              />
                            )}
                          </div>
                          <span className="w-12 text-right font-bold">
                            {shortRate(r.activeRate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">{shortRate(r.completionRate)}</td>
                      <td className="px-2 py-2 text-right">{shortRate(r.assignmentsRate)}</td>
                      <td className="px-2 py-2">
                        {r.state ? (
                          <StatePill state={r.state} />
                        ) : (
                          <span className="text-sm text-ink-muted">Moins de 5 apprenants</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
              {d.averageActiveRate !== null && (
                <span>
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block h-3.5 w-0.5 bg-ink align-middle"
                  />
                  Moyenne de la zone ({d.averageActiveRate} %)
                </span>
              )}
              <span>
                <StatePill state="alert" /> moins de 50 % d’actifs
              </span>
              <span>
                <StatePill state="watch" /> 50 à 64 %
              </span>
              <span>
                <StatePill state="ok" /> 65 % et plus
              </span>
            </p>
          </>
        ) : (
          <p className="mt-2 text-ink-muted">
            Pas de sous-zone à comparer ici. Le détail par classe est dans le{' '}
            <Link href="/mon-espace/suivi" className="font-bold text-primary underline">
              Suivi de l’établissement
            </Link>
            .
          </p>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={cardClass} aria-labelledby="titre-cycles" data-testid="pilot-cycles">
          <h2 id="titre-cycles" className="text-xl font-bold">
            Cours terminés, par cycle
          </h2>
          <p className="mb-3 text-sm text-ink-muted">Part des inscriptions menées jusqu’au bout.</p>
          {d.cycles.length === 0 ? (
            <p className="text-ink-muted">Aucun établissement dans cette zone.</p>
          ) : (
            <ul className="space-y-3" role="list">
              {d.cycles.map((c) => (
                <li
                  key={c.cycle}
                  className="grid grid-cols-[8.5rem_minmax(0,1fr)_6rem] items-center gap-3"
                >
                  <span className="font-bold">{PILOT_CYCLE_LABELS[c.cycle]}</span>
                  <div className="h-4 rounded-r bg-primary-soft">
                    <div
                      className="h-4 rounded-r bg-primary"
                      style={{ width: `${c.completionRate ?? 0}%` }}
                    />
                  </div>
                  <span
                    className={`text-right ${c.completionRate === null ? 'text-sm text-ink-muted' : 'font-bold'}`}
                  >
                    {c.completionRate === null ? 'moins de 5' : `${c.completionRate} %`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cardClass} aria-labelledby="titre-alertes" data-testid="pilot-alerts">
          <h2 id="titre-alertes" className="text-xl font-bold">
            Points d’attention
          </h2>
          <p className="mb-3 text-sm text-ink-muted">
            Ce qui demande une action, du plus urgent au moins urgent.
          </p>
          {d.alerts.length === 0 ? (
            <p className="text-ink-muted">Rien à signaler sur cette période.</p>
          ) : (
            <ul className="space-y-3" role="list">
              {d.alerts.map((a) => (
                <li
                  key={a.title}
                  className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-card border border-l-[5px] border-line p-3 ${STATE[a.level].edge}`}
                >
                  <StatePill
                    state={a.level}
                    label={
                      a.level === 'alert'
                        ? 'Alerte'
                        : a.level === 'watch'
                          ? 'À surveiller'
                          : 'Bonne nouvelle'
                    }
                  />
                  <span className="font-bold text-ink-strong">{a.title}</span>
                  <span className="col-start-2 text-sm text-ink-muted">{a.detail}</span>
                  {a.items.length > 0 && (
                    <details className="col-start-2 text-sm">
                      <summary className="cursor-pointer font-bold text-primary">
                        Voir la liste
                      </summary>
                      <ul className="mt-1 list-disc pl-5">
                        {a.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <h2 className="pt-2 text-2xl font-bold">Détail par cours</h2>
      <details className="text-ink-muted" data-testid="stats-scope">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center">
          {stats.data.organizations.length} structure
          {stats.data.organizations.length > 1 ? 's' : ''} couverte
          {stats.data.organizations.length > 1 ? 's' : ''} (voir la liste)
        </summary>
        <p>{stats.data.organizations.join(', ')}.</p>
      </details>
      {stats.data.courses.length === 0 && <p>Aucun cours publié dans vos structures.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.data.courses.map((c) => (
          <div key={c.courseId} className={smallCard} data-testid="stats-course">
            <h3 className="text-lg font-bold">{c.title}</h3>
            <p className="text-ink-muted">
              {BRANCHES.find((b) => b.code === c.branch)?.title ?? c.branch}
            </p>
            <Figures
              rows={[
                ['Inscrits', count(c.enrolled)],
                ['Ont commencé', count(c.started)],
                ['Ont terminé le cours', count(c.completed)],
                ['Actifs ces 7 derniers jours', count(c.active7)],
                ['Actifs ces 30 derniers jours', count(c.active30)],
                ['Bonnes réponses aux quiz', rate(c.quizSuccess)],
              ]}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={smallCard} data-testid="stats-remediation">
          <h2 className="text-xl font-bold">Rattrapage en lecture</h2>
          <Figures
            rows={[
              ['Élèves qui ont passé le bilan', count(stats.data.remediation.diagnosed)],
              ['Rattrapages en cours', count(stats.data.remediation.inProgress)],
              ['Rattrapages réussis', count(stats.data.remediation.completed)],
              ['Part des rattrapages réussis', rate(stats.data.remediation.effectiveRate)],
            ]}
          />
        </div>
        <div className={smallCard} data-testid="stats-workshop">
          <h2 className="text-xl font-bold">Atelier virtuel de sécurité</h2>
          <Figures
            rows={[
              ['Apprenants qui ont essayé', count(stats.data.workshop.tried)],
              ['Ont réussi la simulation', count(stats.data.workshop.passed)],
              ['Ont demandé leur séance encadrée', count(stats.data.workshop.requested)],
            ]}
          />
        </div>
      </div>
      <p className="text-sm text-ink-muted">
        Calculé le {new Date(d.generatedAt).toLocaleString('fr-FR')}. Aucun nom d’élève n’est envoyé
        à cet écran.
      </p>
    </section>
  );
}
