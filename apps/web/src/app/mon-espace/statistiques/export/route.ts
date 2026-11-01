import { PILOT_PERIOD_LABELS, type PilotOverview, type StatsOverview } from '@lenseignement/types';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { pilotWorkbook } from './workbook';

/** Nom de fichier sans accent ni espace : « pilotage-drena-bouake-trimestre-2026-11-01.xlsx ». */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Tableau de pilotage pour Excel (.xlsx) : tout ce que montre la page, un onglet par section,
 * avec les mêmes filtres (zone, cycle, période). Aucun nom d'élève ; les petits groupes restent
 * masqués.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response('Connexion requise.', { status: 401 });
  const query = new URL(request.url).searchParams.toString();
  const [pilot, stats] = await Promise.all([
    apiGet<PilotOverview>(session.accessToken, `/stats/pilotage${query ? `?${query}` : ''}`),
    apiGet<StatsOverview>(session.accessToken, '/stats/overview'),
  ]);
  if (!pilot.ok || !stats.ok) return new Response('Accès refusé.', { status: 403 });
  const d = pilot.data;
  const generatedAt = new Date(d.generatedAt).toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Abidjan',
  });
  const file = await pilotWorkbook(d, stats.data, { editor: session.displayName, generatedAt });
  const day = d.generatedAt.slice(0, 10);
  const name = `pilotage-${slug(d.zone.name)}-${slug(PILOT_PERIOD_LABELS[d.period])}-${day}.xlsx`;
  return new Response(file, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
