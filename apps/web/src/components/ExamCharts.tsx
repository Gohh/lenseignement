import type { ExamRate } from '@lenseignement/types';

// Chiffres et barres des résultats d'épreuve (épreuve de classe et campagne de zone).

export function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-big border border-line bg-surface p-4">
      <p className="text-sm font-bold text-ink-muted">{label}</p>
      <p className="font-display text-3xl font-extrabold">{value}</p>
      <p className="text-sm text-ink-muted">{hint}</p>
    </div>
  );
}

/** Barres horizontales avec le repère du seuil ; le texte dit « sous le seuil », pas la couleur seule. */
export function Bars({ rows, threshold }: { rows: ExamRate[]; threshold: number }) {
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
