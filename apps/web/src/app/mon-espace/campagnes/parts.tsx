import { levelLabel, type CampaignStatus, type CampaignSummary } from '@lenseignement/types';
import { StatePill } from '../statistiques/parts';

// Éléments communs aux pages des campagnes d'évaluation.

export const HOME = '/mon-espace/campagnes';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });
/** Date de début, et dernier jour (la fin est stockée au lendemain à 0 h). */
export const startDay = (c: CampaignSummary) => dateFormat.format(new Date(c.startsAt));
export const lastDay = (c: CampaignSummary) =>
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

export const zoneLabel = (c: CampaignSummary) =>
  c.zone.kind === 'pays'
    ? 'Tout le pays'
    : `${c.zone.kind === 'iepp' ? 'IEPP' : 'DRENA'} ${c.zone.name}`;

export const levelName = (c: CampaignSummary) => levelLabel(c.level) ?? c.level;
