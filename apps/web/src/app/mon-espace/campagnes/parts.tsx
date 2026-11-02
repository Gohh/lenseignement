import { levelLabel, type CampaignStatus, type CampaignZone } from '@lenseignement/types';
import { StatePill } from '../statistiques/parts';

// Éléments communs aux pages des campagnes d'évaluation.

export const HOME = '/mon-espace/campagnes';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });
/** Date de début, et dernier jour (la fin est stockée au lendemain à 0 h). */
type Dates = { startsAt: string; endsAt: string };
export const startDay = (c: Dates) => dateFormat.format(new Date(c.startsAt));
export const lastDay = (c: Dates) =>
  dateFormat.format(new Date(new Date(c.endsAt).getTime() - 86_400_000));

export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

const STATUS: Record<CampaignStatus, { label: string; pill: string }> = {
  'a-venir': { label: 'À venir', pill: 'bg-line text-ink' },
  'en-cours': { label: 'En cours', pill: 'bg-primary-soft text-primary' },
  close: { label: 'Close', pill: 'bg-ink text-surface' },
};

export function StatusPill({ status }: { status: CampaignStatus }) {
  const s = STATUS[status];
  return (
    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${s.pill}`}>
      {s.label}
    </span>
  );
}

/** Participation : 70 % et plus « Bon », 50 à 69 % « À relancer », moins « En retard ». */
export function ParticipationPill({ rate }: { rate: number }) {
  if (rate >= 70) return <StatePill state="ok" label="Bon" />;
  if (rate >= 50) return <StatePill state="watch" label="À relancer" />;
  return <StatePill state="alert" label="En retard" />;
}

/** « DRENA Abidjan 1 », sans doubler le mot quand le nom le porte déjà. */
export const zoneLabel = (c: { zone: CampaignZone }) => {
  if (c.zone.kind === 'pays') return 'Tout le pays';
  const prefix = c.zone.kind === 'iepp' ? 'IEPP' : 'DRENA';
  return c.zone.name.toUpperCase().startsWith(prefix) ? c.zone.name : `${prefix} ${c.zone.name}`;
};

export const levelName = (c: { level: string }) => levelLabel(c.level) ?? c.level;
