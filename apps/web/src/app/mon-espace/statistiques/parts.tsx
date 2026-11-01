import type { MaskedCount, MaskedPercent, PilotOverview, PilotState } from '@lenseignement/types';

// Éléments communs au tableau de pilotage à l'écran et au rapport imprimé.

export const count = (n: MaskedCount) => (n === null ? 'moins de 5' : n.toLocaleString('fr-FR'));
export const rate = (p: MaskedPercent) => (p === null ? 'pas assez de personnes' : `${p} %`);
export const shortRate = (p: MaskedPercent) => (p === null ? '–' : `${p} %`);

export const STATE: Record<
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

export function StatePill({ state, label }: { state: PilotState; label?: string }) {
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

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Courbe des apprenants actifs par semaine : une seule série, le dernier point mis en valeur. */
export function WeeklyChart({ weekly }: { weekly: PilotOverview['weekly'] }) {
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
