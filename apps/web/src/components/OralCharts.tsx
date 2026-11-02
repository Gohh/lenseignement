import type { OralClassResults } from '@lenseignement/types';

// Répartition des élèves et moyenne par partie (évaluations orales : classe et campagne).

// Du plus fragile au repère atteint ; chaque bande a aussi son nom et son nombre.
const BAND_STYLE: Record<OralClassResults['bands'][number]['key'], string> = {
  zero: 'bg-[#d03b3b]',
  debut: 'bg-[#fab219]',
  progres: 'bg-[#8fc9a8]',
  repere: 'bg-primary',
};

export function OralBands({ bands }: { bands: OralClassResults['bands'] }) {
  const total = bands.reduce((a, b) => a + b.count, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-3">
      <div
        className="flex h-4 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={bands.map((b) => `${b.label} : ${b.count}`).join(', ')}
      >
        {bands
          .filter((b) => b.count > 0)
          .map((b) => (
            <div
              key={b.key}
              className={BAND_STYLE[b.key]}
              style={{ width: `${(b.count * 100) / total}%` }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {bands.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded-sm ${BAND_STYLE[b.key]}`}
            />
            {b.label} : <strong>{b.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OralPartBars({ parts }: { parts: OralClassResults['byPart'] }) {
  return (
    <ul className="space-y-3">
      {parts.map((p, i) => (
        <li key={i}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-bold">{p.title}</span>
            <span className="text-sm">
              <strong>{p.average}</strong> <span className="text-ink-muted">{p.unit}</span>
            </span>
          </div>
          <div
            className="mt-1 h-3 rounded-full bg-line"
            role="img"
            aria-label={`${p.title} : ${p.average} ${p.unit}`}
          >
            <div
              className="h-3 rounded-full bg-primary"
              style={{ width: `${Math.max(1, Math.min(100, (p.average * 100) / p.max))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
