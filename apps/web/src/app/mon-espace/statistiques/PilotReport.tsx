import {
  BRANCHES,
  PILOT_CYCLE_LABELS,
  PILOT_PERIOD_LABELS,
  type MaskedCount,
  type PilotFigure,
  type PilotOverview,
  type StatsOverview,
} from '@lenseignement/types';
import { count, shortRate, STATE, StatePill, WeeklyChart } from './parts';

// Rapport de pilotage pour l'impression et « Enregistrer au format PDF » : une mise en page à part,
// invisible à l'écran. Page 1 : l'essentiel ; page 2 : le détail. Le pied de page numéroté est
// dans globals.css (`@page pilotage`).

const DAY = 24 * 3600 * 1000;
const box = 'lse-print-keep rounded-lg border border-[#dfe5e1] p-3';
const sectionTitle =
  'mb-2 mt-5 flex items-center gap-2 text-[15px] font-bold text-[#10301f] before:h-4 before:w-1 before:rounded-sm before:bg-primary';

const day = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Africa/Abidjan' });

/** Dates couvertes par la période (même règle que l'API : l'année scolaire part du 1er septembre). */
function periodRange(period: PilotOverview['period'], generatedAt: Date): string {
  if (period === 'annee') {
    const year =
      generatedAt.getUTCMonth() >= 8
        ? generatedAt.getUTCFullYear()
        : generatedAt.getUTCFullYear() - 1;
    return `depuis le 1er septembre ${year}`;
  }
  return `${day(new Date(generatedAt.getTime() - Number(period) * DAY))} – ${day(generatedAt)}`;
}

/** Évolution d'un chiffre clé, en texte court : « ▲ +6 % », « ▼ −2 points ». */
function evolution(
  figure: PilotFigure,
  unit: 'count' | 'points',
): { text: string; tone: string } | null {
  const { value, previous } = figure;
  if (value === null || previous === null) return null;
  const diff =
    unit === 'points'
      ? value - previous
      : previous === 0
        ? null
        : Math.round(((value - previous) / previous) * 100);
  if (diff === null) return null;
  const sign = diff > 0 ? '▲ +' : diff < 0 ? '▼ −' : '= ';
  const n = Math.abs(diff);
  const text = unit === 'points' ? `${sign}${n} point${n > 1 ? 's' : ''}` : `${sign}${n} %`;
  return { text, tone: diff > 0 ? 'text-[#006300]' : diff < 0 ? 'text-[#a52a32]' : '' };
}

function Bar({
  label,
  value,
  share,
  color,
}: {
  label: string;
  value: string;
  share: number;
  color: string;
}) {
  return (
    <div className="my-1.5 text-[11px]">
      <p className="flex justify-between font-bold">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </p>
      <div className="mt-0.5 h-2 rounded-r bg-primary-soft">
        <div className="h-2 rounded-r" style={{ width: `${share}%`, background: color }} />
      </div>
    </div>
  );
}

function Lines({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="text-right font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PilotReport({
  pilot: d,
  stats: s,
  editor,
  generatedAt,
}: {
  pilot: PilotOverview;
  stats: StatsOverview;
  editor: string | null;
  generatedAt: string;
}) {
  const generated = new Date(d.generatedAt);
  const zonePath = d.zone.path.length > 0 ? d.zone.path : [{ id: null, name: d.zone.name }];
  const run = `${d.zone.name} · ${PILOT_PERIOD_LABELS[d.period]}`;
  const byDrena = d.rows.some((r) => r.type === 'authority');
  const base = d.funnel.enrolled ?? 0;
  const funnel: Array<[string, MaskedCount, string]> = [
    ['Inscrits à un cours', d.funnel.enrolled, '#7cc39b'],
    ['Ont commencé', d.funnel.started, '#4ea476'],
    ['À mi-parcours', d.funnel.halfway, '#2a8558'],
    ['Ont terminé', d.funnel.completed, '#146b46'],
  ];
  const kpis = [
    ['Apprenants actifs', d.kpis.active, 'count'],
    ['Cours terminés', d.kpis.completionRate, 'points'],
    ['Devoirs rendus à temps', d.kpis.assignmentsRate, 'points'],
    ['Réussite aux quiz', d.kpis.quizSuccess, 'points'],
  ] as const;

  return (
    <article
      className="lse-report hidden text-[13px] text-ink print:block"
      data-testid="pilot-report"
    >
      {/* Page 1 : l'essentiel */}
      <div className="mb-4 h-2 bg-[linear-gradient(90deg,#146b46_70%,#fab219_70%)]" />
      <header className="flex items-start justify-between border-b-2 border-primary pb-3">
        <p className="flex items-center gap-2.5 font-display text-lg font-extrabold text-primary">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-surface">
            L
          </span>
          L’Enseignement
        </p>
        <p className="text-right text-[11px] leading-relaxed text-ink-muted">
          Rapport de pilotage
          <br />
          Édité le {generatedAt}
          {editor && (
            <>
              <br />
              par {editor}
            </>
          )}
        </p>
      </header>

      <h1 className="mt-4 text-[28px] font-extrabold text-[#10301f]">Tableau de pilotage</h1>
      <p className="text-ink-muted">
        {zonePath.map((p, i) => (
          <span key={p.id ?? 'pays'}>
            {i > 0 && ' › '}
            {i === zonePath.length - 1 ? <b className="text-ink">{p.name}</b> : p.name}
          </span>
        ))}
      </p>
      <p className="mt-2.5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-[#cfe3d7] bg-[#f6fbf8] px-3 py-0.5">
          Période : <b className="text-primary">{PILOT_PERIOD_LABELS[d.period]}</b> (
          {periodRange(d.period, generated)})
        </span>
        <span className="rounded-full border border-[#cfe3d7] bg-[#f6fbf8] px-3 py-0.5">
          Cycle : <b className="text-primary">{d.cycle ? PILOT_CYCLE_LABELS[d.cycle] : 'tous'}</b>
        </span>
        {d.period !== 'annee' && (
          <span className="rounded-full border border-[#cfe3d7] bg-[#f6fbf8] px-3 py-0.5">
            Comparé à la période d’avant
          </span>
        )}
      </p>
      <p className="my-3 rounded-md bg-[#fff8e6] px-2.5 py-1.5 text-[11px] text-[#6b4a00]">
        Aucun nom d’élève dans ce rapport. Un groupe de moins de {d.threshold} personnes s’affiche «
        – », pour que personne ne soit reconnu.
      </p>

      <ul className="grid grid-cols-4 gap-2.5" role="list">
        {kpis.map(([label, figure, unit]) => {
          const ev = evolution(figure, unit);
          const down = ev?.text.startsWith('▼');
          return (
            <li
              key={label}
              className={`rounded-lg border border-t-4 border-[#dfe5e1] px-3 py-2 ${down ? 'border-t-[#d03b3b]' : 'border-t-primary'}`}
            >
              <p className="text-[11px] text-ink-muted">{label}</p>
              <p className="text-2xl font-extrabold text-[#10301f]">
                {figure.value === null
                  ? '–'
                  : unit === 'count'
                    ? figure.value.toLocaleString('fr-FR')
                    : `${figure.value} %`}
              </p>
              <p className={`text-[11px] font-bold ${ev?.tone ?? 'text-ink-muted'}`}>
                {ev?.text ?? 'Pas de comparaison'}
              </p>
            </li>
          );
        })}
      </ul>

      <h2 className={sectionTitle}>Activité et parcours</h2>
      <div className="grid grid-cols-[1.5fr_1fr] gap-3.5">
        <section className={box}>
          <h3 className="mb-1 text-xs font-bold">Apprenants actifs chaque semaine</h3>
          <WeeklyChart weekly={d.weekly} />
        </section>
        <section className={box}>
          <h3 className="mb-1 text-xs font-bold">Où en sont les apprenants</h3>
          {funnel.map(([label, value, color]) => {
            const share = value !== null && base > 0 ? Math.round((100 * value) / base) : 0;
            return (
              <Bar
                key={label}
                label={label}
                value={`${value === null ? '–' : value.toLocaleString('fr-FR')}${
                  value !== null && label !== 'Inscrits à un cours' && base > 0
                    ? ` · ${share} %`
                    : ''
                }`}
                share={value === null ? 0 : label === 'Inscrits à un cours' ? 100 : share}
                color={color}
              />
            );
          })}
        </section>
      </div>

      <h2 className={sectionTitle}>
        {byDrena ? 'Comparaison des DRENA' : 'Comparaison des établissements'}
        {d.rows.length > 0 && (
          <span className="text-[11px] font-normal text-ink-muted">
            — les plus fragiles d’abord
          </span>
        )}
      </h2>
      {d.rows.length === 0 ? (
        <p className="text-ink-muted">Pas de sous-zone à comparer ici.</p>
      ) : (
        <>
          <table className="w-full border-collapse text-[11.5px] tabular-nums">
            <thead>
              <tr className="border-b-2 border-primary text-left text-[10px] uppercase tracking-wide text-ink-muted">
                <th className="px-1.5 py-1.5">{byDrena ? 'DRENA' : 'Établissement'}</th>
                <th className="px-1.5 py-1.5 text-right">Apprenants</th>
                <th className="w-44 px-1.5 py-1.5">Actifs sur la période</th>
                <th className="px-1.5 py-1.5 text-right">Cours terminés</th>
                <th className="px-1.5 py-1.5 text-right">Devoirs rendus</th>
                <th className="px-1.5 py-1.5">État</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr
                  key={r.id}
                  className="lse-print-keep border-b border-[#eceee9] even:bg-[#fafbf9]"
                >
                  <td className="px-1.5 py-1.5 font-bold">{r.name}</td>
                  <td className="px-1.5 py-1.5 text-right">
                    {r.learners === null ? '–' : count(r.learners)}
                  </td>
                  <td className="px-1.5 py-1.5">
                    {r.activeRate === null ? (
                      <span className="block text-center">–</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="relative h-2 flex-1 rounded-r bg-primary-soft">
                          <div
                            className="absolute inset-y-0 left-0 rounded-r bg-primary"
                            style={{ width: `${r.activeRate ?? 0}%` }}
                          />
                          {d.averageActiveRate !== null && (
                            <div
                              className="absolute -inset-y-1 w-0.5 bg-[#10301f]"
                              style={{ left: `${d.averageActiveRate}%` }}
                            />
                          )}
                        </div>
                        <b className="w-9 text-right">{shortRate(r.activeRate)}</b>
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-right">{shortRate(r.completionRate)}</td>
                  <td className="px-1.5 py-1.5 text-right">{shortRate(r.assignmentsRate)}</td>
                  <td className="px-1.5 py-1.5">
                    {r.state ? (
                      <StatePill state={r.state} />
                    ) : (
                      <span className="text-[10.5px] text-ink-muted">Moins de {d.threshold}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10px] text-ink-muted">
            {d.averageActiveRate !== null &&
              `Trait noir : moyenne de la zone (${d.averageActiveRate} %) · `}
            En alerte : moins de 50 % d’actifs · À surveiller : 50 à 64 % · Bon : 65 % et plus
          </p>
        </>
      )}

      {/* Page 2 : le détail */}
      <div className="break-before-page">
        <p className="flex justify-between border-b border-[#dfe5e1] pb-2 text-[11px] text-ink-muted">
          <span>
            <b className="text-primary">Tableau de pilotage</b> · {run}
          </span>
          <span>Édité le {generatedAt}</span>
        </p>

        <h2 className={sectionTitle}>Points d’attention</h2>
        {d.alerts.length === 0 ? (
          <p className="text-ink-muted">Rien à signaler sur cette période.</p>
        ) : (
          <ul className="space-y-2" role="list">
            {d.alerts.map((a) => (
              <li
                key={a.title}
                className={`lse-print-keep rounded-md border border-l-[5px] border-[#dfe5e1] px-2.5 py-2 text-xs ${STATE[a.level].edge}`}
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
                <p className="mt-1 font-bold">{a.title}</p>
                <p className="text-[11px] text-ink-muted">{a.detail}</p>
                {a.items.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[11px]">
                    {a.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        <h2 className={sectionTitle}>Cours terminés, par cycle</h2>
        <section className={box}>
          {d.cycles.length === 0 ? (
            <p className="text-ink-muted">Aucun établissement dans cette zone.</p>
          ) : (
            d.cycles.map((c) => (
              <Bar
                key={c.cycle}
                label={PILOT_CYCLE_LABELS[c.cycle]}
                value={
                  c.completionRate === null ? `moins de ${d.threshold}` : `${c.completionRate} %`
                }
                share={c.completionRate ?? 0}
                color="#146b46"
              />
            ))
          )}
        </section>

        <h2 className={sectionTitle}>Détail par cours</h2>
        {s.courses.length === 0 ? (
          <p className="text-ink-muted">Aucun cours publié dans ces structures.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2" role="list">
            {s.courses.map((c) => (
              <li
                key={c.courseId}
                className="lse-print-keep rounded-md border border-[#dfe5e1] px-2.5 py-2"
              >
                <p className="text-[11.5px] font-bold">{c.title}</p>
                <p className="mb-1 text-[10px] text-ink-muted">
                  {BRANCHES.find((b) => b.code === c.branch)?.title ?? c.branch}
                </p>
                <Lines
                  rows={[
                    ['Inscrits', c.enrolled === null ? '–' : count(c.enrolled)],
                    ['Ont terminé', c.completed === null ? '–' : count(c.completed)],
                    ['Quiz réussis', shortRate(c.quizSuccess)],
                  ]}
                />
              </li>
            ))}
          </ul>
        )}

        <h2 className={sectionTitle}>Rattrapage et atelier</h2>
        <div className="grid grid-cols-2 gap-3.5">
          <section className={box}>
            <h3 className="mb-1 text-xs font-bold">Rattrapage en lecture</h3>
            <Lines
              rows={[
                [
                  'Bilan passé',
                  s.remediation.diagnosed === null ? '–' : count(s.remediation.diagnosed),
                ],
                [
                  'En cours',
                  s.remediation.inProgress === null ? '–' : count(s.remediation.inProgress),
                ],
                [
                  'Réussis',
                  s.remediation.completed === null ? '–' : count(s.remediation.completed),
                ],
                ['Part des rattrapages réussis', shortRate(s.remediation.effectiveRate)],
              ]}
            />
          </section>
          <section className={box}>
            <h3 className="mb-1 text-xs font-bold">Atelier virtuel de sécurité</h3>
            <Lines
              rows={[
                ['Ont essayé', s.workshop.tried === null ? '–' : count(s.workshop.tried)],
                ['Simulation réussie', s.workshop.passed === null ? '–' : count(s.workshop.passed)],
                [
                  'Séance demandée',
                  s.workshop.requested === null ? '–' : count(s.workshop.requested),
                ],
              ]}
            />
          </section>
        </div>

        <div className="lse-print-keep mt-6 grid grid-cols-2 gap-5 text-[11px] text-ink-muted">
          <p className="h-14 border-t border-line-strong pt-1.5">Visa du responsable</p>
          <p className="h-14 border-t border-line-strong pt-1.5">Observations</p>
        </div>
      </div>
    </article>
  );
}
