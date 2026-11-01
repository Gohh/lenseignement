import {
  PILOT_CYCLE_LABELS,
  PILOT_PERIOD_LABELS,
  type MaskedPercent,
  type PilotCycle,
  type PilotOverview,
  type PilotPeriod,
} from '@lenseignement/types';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

const STATE_LABELS = { alert: 'En alerte', watch: 'À surveiller', ok: 'Bon' } as const;

/** Une cellule CSV (séparateur « ; », lu tel quel par Excel en français). */
function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const pct = (p: MaskedPercent) => (p === null ? 'moins de 5' : p);

/** Tableau de pilotage en tableur (CSV) : chiffres clés et sous-zones, sans aucun nom d'élève. */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response('Connexion requise.', { status: 401 });
  const query = new URL(request.url).searchParams.toString();
  const result = await apiGet<PilotOverview>(
    session.accessToken,
    `/stats/pilotage${query ? `?${query}` : ''}`,
  );
  if (!result.ok) return new Response('Accès refusé.', { status: 403 });
  const d = result.data;
  const lines: Array<Array<string | number | null>> = [
    ['Tableau de pilotage', d.zone.name],
    ['Période', PILOT_PERIOD_LABELS[d.period as PilotPeriod]],
    ['Cycle', d.cycle ? PILOT_CYCLE_LABELS[d.cycle as PilotCycle] : 'Tous les cycles'],
    ['Calculé le', new Date(d.generatedAt).toLocaleString('fr-FR')],
    [],
    ['Chiffre', 'Période', 'Période d’avant'],
    ['Apprenants actifs', d.kpis.active.value, d.kpis.active.previous],
    ['Cours terminés (%)', d.kpis.completionRate.value, d.kpis.completionRate.previous],
    ['Devoirs rendus à temps (%)', d.kpis.assignmentsRate.value, d.kpis.assignmentsRate.previous],
    ['Réussite aux quiz (%)', d.kpis.quizSuccess.value, d.kpis.quizSuccess.previous],
    [],
    [
      'Zone',
      'Établissements',
      'Apprenants',
      'Actifs (%)',
      'Cours terminés (%)',
      'Devoirs rendus (%)',
      'État',
    ],
    ...d.rows.map((r) => [
      r.name,
      r.establishments,
      r.learners === null ? 'moins de 5' : r.learners,
      pct(r.activeRate),
      pct(r.completionRate),
      pct(r.assignmentsRate),
      r.state ? STATE_LABELS[r.state] : '',
    ]),
  ];
  const csv = '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n';
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="tableau-de-pilotage.csv"',
    },
  });
}
