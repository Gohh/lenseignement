import {
  ORAL_SUBJECT_LABELS,
  STATS_THRESHOLD,
  type OralCampaignResultRow,
  type OralCampaignResults,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Tile } from '@/components/ExamCharts';
import { buttonClass, secondaryButtonClass } from '@/components/Notice';
import { OralBands, OralPartBars } from '@/components/OralCharts';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { lastDay, levelName, percent, startDay, zoneLabel } from '../../../../campagnes/parts';
import { StatePill } from '../../../parts';
import { PrintButton } from '../../../PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Résultats de la campagne orale' };

const HOME = '/mon-espace/statistiques';
const cardClass = 'rounded-big border border-line bg-surface p-5 print:break-inside-avoid';
const dash = '–';

/** État d'une ligne : part d'élèves au repère (70 % Bon, 40 % À surveiller), sinon élèves à zéro. */
function RowState({ row, hasBenchmark }: { row: OralCampaignResultRow; hasBenchmark: boolean }) {
  if (row.evaluated === 0) return <span className="font-bold">Non évaluée</span>;
  if (row.median === null) return <span className="text-ink-muted">moins de 5 élèves</span>;
  if (hasBenchmark && row.benchmarkRate !== null) {
    if (row.benchmarkRate >= 70) return <StatePill state="ok" label="Bon" />;
    if (row.benchmarkRate >= 40) return <StatePill state="watch" />;
    return <StatePill state="alert" />;
  }
  if ((row.zeroRate ?? 0) >= 30) return <StatePill state="alert" />;
  if ((row.zeroRate ?? 0) >= 10) return <StatePill state="watch" />;
  return <StatePill state="ok" label="Bon" />;
}

function RowsTable({
  rows,
  title,
  firstColumn,
  groupLabel,
  unit,
  hasBenchmark,
  testId,
}: {
  rows: OralCampaignResultRow[];
  title: string;
  firstColumn: string;
  groupLabel: string | null;
  unit: string;
  hasBenchmark: boolean;
  testId: string;
}) {
  return (
    <div className={cardClass}>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-ink-muted">
        Les plus fragiles d’abord.{' '}
        {hasBenchmark
          ? 'Bon : 70 % des élèves ou plus au repère · À surveiller : 40 à 69 % · En alerte : moins.'
          : 'Sans repère : En alerte dès 30 % d’élèves à zéro, À surveiller dès 10 %.'}
      </p>
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={title}>
        <table className="w-full border-collapse text-left" data-testid={testId}>
          <thead className="text-sm">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3">
                {firstColumn}
              </th>
              {groupLabel && (
                <th scope="col" className="px-3 py-2">
                  {groupLabel}
                </th>
              )}
              <th scope="col" className="px-3 py-2">
                Évalués
              </th>
              <th scope="col" className="px-3 py-2">
                Score du milieu ({unit})
              </th>
              <th scope="col" className="px-3 py-2">
                À zéro
              </th>
              <th scope="col" className="px-3 py-2">
                Repère atteint
              </th>
              <th scope="col" className="px-3 py-2">
                État
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row" className="py-2 pr-3 font-bold">
                  {r.name}
                </th>
                {groupLabel && <td className="px-3 py-2">{r.group}</td>}
                <td className="px-3 py-2">
                  {percent(r.evaluated, r.expected)} %{' '}
                  <span className="text-sm text-ink-muted">
                    ({r.evaluated} sur {r.expected})
                  </span>
                </td>
                <td className="px-3 py-2">{r.median ?? dash}</td>
                <td className="px-3 py-2">{r.zeroRate === null ? dash : `${r.zeroRate} %`}</td>
                <td className="px-3 py-2">
                  {r.benchmarkRate === null ? dash : `${r.benchmarkRate} %`}
                </td>
                <td className="px-3 py-2">
                  <RowState row={r} hasBenchmark={hasBenchmark} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Résultats d'une campagne orale close, sans nom d'élève : à l'écran, en PDF et pour Excel. */
export default async function OralCampaignResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/campagnes/orale/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const res = await apiGet<OralCampaignResults>(
    session.accessToken,
    `/oral/campaigns/${id}/results`,
  );
  if (!res.ok) {
    return (
      <section className="space-y-4">
        <Link href={HOME} className="inline-flex min-h-[44px] items-center underline">
          ← Tableau de pilotage
        </Link>
        <h1 className="text-3xl font-extrabold">Résultats de la campagne orale</h1>
        <p>
          {res.status === 400
            ? 'Les résultats s’ouvrent à la clôture de la campagne.'
            : 'Cette campagne ne fait pas partie de vos statistiques.'}
        </p>
      </section>
    );
  }
  const r = res.data;
  const c = r.campaign;
  const hasBenchmark = r.benchmark !== null;
  const generatedAt = new Date().toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Abidjan',
  });

  return (
    <section className="space-y-6">
      <Link href={HOME} className="inline-flex min-h-[44px] items-center underline print:hidden">
        ← Tableau de pilotage
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="font-bold text-ink-muted">Piloter / Statistiques / Campagnes orales</p>
          <h1 className="text-3xl font-extrabold">Résultats · {c.title}</h1>
          <p className="text-ink-muted">
            {zoneLabel(c)} · {levelName(c)} · du {startDay(c)} au {lastDay(c)} · épreuve orale{' '}
            {`« ${c.test.title} »`} ({ORAL_SUBJECT_LABELS[c.test.subject]})
          </p>
          {r.scope === 'ma-zone' && (
            <p className="text-sm font-bold">
              Vous voyez la partie de la campagne qui concerne vos structures.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 print:hidden">
          <PrintButton className={secondaryButtonClass} />
          <a href={`${HOME}/campagnes/orale/${id}/export`} className={buttonClass}>
            Télécharger pour Excel
          </a>
        </div>
      </div>
      <p className="rounded-card border-l-4 border-primary bg-primary-soft p-3">
        Aucun nom d’élève sur cette page. Les chiffres n’apparaissent que pour un groupe d’au moins{' '}
        {STATS_THRESHOLD} élèves évalués. Partie suivie : <strong>{r.reference.title}</strong>
        {r.benchmark
          ? ` ; repère du niveau : ${r.benchmark.perMinute} ${r.reference.unit}${r.benchmark.questions !== null ? ` et ${r.benchmark.questions} question(s) juste(s)` : ''}.`
          : ' ; aucun repère réglé pour ce niveau.'}
      </p>

      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="oral-campaign-results-kpis"
      >
        <Tile
          label="Élèves évalués"
          value={`${percent(r.evaluated, r.expected)} %`}
          hint={`${r.evaluated} sur ${r.expected}`}
        />
        <Tile
          label="Score du milieu"
          value={r.median === null ? dash : String(r.median)}
          hint={r.median === null ? 'moins de 5 élèves' : `${r.reference.unit} (médiane)`}
        />
        <Tile
          label="Élèves à zéro"
          value={r.zeroRate === null ? dash : `${r.zeroRate} %`}
          hint="aucun juste sur la partie suivie"
        />
        <Tile
          label="Repère atteint"
          value={r.benchmarkRate === null ? dash : `${r.benchmarkRate} %`}
          hint={hasBenchmark ? 'des élèves évalués' : 'pas de repère'}
        />
      </div>

      {r.bands.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cardClass} data-testid="oral-campaign-results-bands">
            <h2 className="mb-3 text-xl font-bold">Où en sont les élèves</h2>
            <OralBands bands={r.bands} />
          </div>
          <div className={cardClass}>
            <h2 className="mb-3 text-xl font-bold">Moyenne par partie</h2>
            <OralPartBars parts={r.byPart} />
          </div>
        </div>
      )}

      {r.groupLabel && r.groups.length > 1 && (
        <RowsTable
          rows={r.groups}
          title={`Par ${r.groupLabel}`}
          firstColumn={r.groupLabel}
          groupLabel={null}
          unit={r.reference.unit}
          hasBenchmark={hasBenchmark}
          testId="oral-campaign-results-groups"
        />
      )}
      <RowsTable
        rows={r.schools}
        title="Par école"
        firstColumn="École"
        groupLabel={r.groupLabel}
        unit={r.reference.unit}
        hasBenchmark={hasBenchmark}
        testId="oral-campaign-results-schools"
      />
      <p className="text-sm text-ink-muted">
        Calculé le {generatedAt}
        {c.createdBy ? ` · campagne lancée par ${c.createdBy}` : ''}.
      </p>
    </section>
  );
}
