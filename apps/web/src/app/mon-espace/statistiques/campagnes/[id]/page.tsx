import {
  EXERCISE_DOMAIN_LABELS,
  STATS_THRESHOLD,
  type CampaignResultRow,
  type CampaignResults,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bars, Tile } from '@/components/ExamCharts';
import { buttonClass, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { lastDay, levelName, percent, startDay, zoneLabel } from '../../../campagnes/parts';
import { StatePill } from '../../parts';
import { PrintButton } from '../../PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Résultats de la campagne' };

const HOME = '/mon-espace/statistiques';
const cardClass = 'rounded-big border border-line bg-surface p-5 print:break-inside-avoid';
const dash = '–';

/** Moyenne : Bon au-dessus du seuil, À surveiller jusqu'à 10 points dessous, sinon En alerte. */
function AverageState({ row, threshold }: { row: CampaignResultRow; threshold: number }) {
  if (row.participants === 0) return <span className="font-bold">Non évaluée</span>;
  if (row.average === null) return <span className="text-ink-muted">moins de 5 copies</span>;
  if (row.average >= threshold) return <StatePill state="ok" label="Bon" />;
  if (row.average >= threshold - 10) return <StatePill state="watch" />;
  return <StatePill state="alert" />;
}

function ResultTable({
  rows,
  title,
  firstColumn,
  groupLabel,
  threshold,
  testId,
}: {
  rows: CampaignResultRow[];
  title: string;
  firstColumn: string;
  groupLabel: string | null;
  threshold: number;
  testId: string;
}) {
  return (
    <div className={cardClass}>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-ink-muted">
        Les plus faibles d’abord. Bon : moyenne au seuil ou plus · À surveiller : jusqu’à 10 points
        sous le seuil · En alerte : plus bas.
      </p>
      <div className="mt-3 overflow-x-auto">
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
                Ont composé
              </th>
              <th scope="col" className="px-3 py-2">
                Moyenne
              </th>
              <th scope="col" className="px-3 py-2">
                Au-dessus du seuil
              </th>
              <th scope="col" className="px-3 py-2">
                Domaine le plus faible
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
                  {percent(r.participants, r.expected)} %{' '}
                  <span className="text-sm text-ink-muted">
                    ({r.participants} sur {r.expected})
                  </span>
                </td>
                <td className="px-3 py-2">{r.average === null ? dash : `${r.average} / 100`}</td>
                <td className="px-3 py-2">{r.above === null ? dash : `${r.above} %`}</td>
                <td className="px-3 py-2">
                  {r.weakest ? `${r.weakest.label} (${r.weakest.rate} %)` : dash}
                </td>
                <td className="px-3 py-2">
                  <AverageState row={r} threshold={threshold} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Résultats d'une campagne close, sans nom d'élève : à l'écran, en PDF (impression) et pour Excel. */
export default async function CampaignResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/campagnes/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const res = await apiGet<CampaignResults>(
    session.accessToken,
    `/authoring/campaigns/${id}/results`,
  );
  if (!res.ok) {
    return (
      <section className="space-y-4">
        <Link href={HOME} className="inline-flex min-h-[44px] items-center underline">
          ← Tableau de pilotage
        </Link>
        <h1 className="text-3xl font-extrabold">Résultats de la campagne</h1>
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
  const t = c.exam.threshold;
  const hardest = [...r.byQuestion].sort((a, b) => a.rate - b.rate);
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
          <p className="font-bold text-ink-muted">Piloter / Statistiques / Campagnes</p>
          <h1 className="text-3xl font-extrabold">Résultats · {c.title}</h1>
          <p className="text-ink-muted">
            {zoneLabel(c)} · {levelName(c)} · du {startDay(c)} au {lastDay(c)} · épreuve{' '}
            {`« ${c.exam.title} »`}, {c.exam.questionCount} questions, seuil {t} %
          </p>
          {r.scope === 'ma-zone' && (
            <p className="text-sm font-bold">
              Vous voyez la partie de la campagne qui concerne vos structures.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 print:hidden">
          <PrintButton className={secondaryButtonClass} />
          <a href={`${HOME}/campagnes/${id}/export`} className={buttonClass}>
            Télécharger pour Excel
          </a>
        </div>
      </div>
      <p className="rounded-card border-l-4 border-primary bg-primary-soft p-3">
        Aucun nom d’élève sur cette page. Une moyenne n’apparaît que pour un groupe d’au moins{' '}
        {STATS_THRESHOLD} copies, pour que personne ne soit reconnu.
      </p>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="campaign-results-kpis">
        <Tile
          label="Ont composé"
          value={`${percent(r.participants, r.expected)} %`}
          hint={`${r.participants} élèves sur ${r.expected}`}
        />
        <Tile
          label="Moyenne"
          value={r.average === null ? dash : `${r.average} / 100`}
          hint={r.average === null ? 'moins de 5 copies' : 'part des points obtenus'}
        />
        <Tile
          label="Au-dessus du seuil"
          value={r.above === null ? dash : `${r.above} %`}
          hint={`des élèves ont au moins ${t} %`}
        />
      </div>

      {r.byDomain.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cardClass} data-testid="campaign-results-domains">
            <h2 className="mb-3 text-xl font-bold">Par domaine</h2>
            <Bars rows={r.byDomain} threshold={t} />
          </div>
          <div className={cardClass}>
            <h2 className="mb-3 text-xl font-bold">Par façon de penser</h2>
            <Bars rows={r.bySkill} threshold={t} />
          </div>
        </div>
      )}

      {r.groupLabel && r.groups.length > 1 && (
        <ResultTable
          rows={r.groups}
          title={`Par ${r.groupLabel}`}
          firstColumn={r.groupLabel}
          groupLabel={null}
          threshold={t}
          testId="campaign-results-groups"
        />
      )}
      <ResultTable
        rows={r.schools}
        title="Par école"
        firstColumn="École"
        groupLabel={r.groupLabel}
        threshold={t}
        testId="campaign-results-schools"
      />

      {hardest.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Questions, des moins réussies aux plus réussies</h2>
          <div className="mt-3 overflow-x-auto">
            <table
              className="w-full border-collapse text-left"
              data-testid="campaign-results-questions"
            >
              <thead className="text-sm">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3">
                    N°
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Question
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Domaine
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Réussite
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {hardest.map((q) => (
                  <tr key={q.key}>
                    <td className="py-2 pr-3">{q.position}</td>
                    <th scope="row" className="px-3 py-2 font-normal">
                      {q.label}
                    </th>
                    <td className="px-3 py-2">{EXERCISE_DOMAIN_LABELS[q.domain]}</td>
                    <td className="px-3 py-2 font-bold">{q.rate} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-sm text-ink-muted">
        Calculé le {generatedAt}
        {c.createdBy ? ` · campagne lancée par ${c.createdBy}` : ''}.
      </p>
    </section>
  );
}
