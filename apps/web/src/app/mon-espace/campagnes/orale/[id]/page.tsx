import { ORAL_SUBJECT_LABELS, type OralCampaignDetail } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { closeOralCampaignAction, deleteOralCampaignAction } from '../../actions';
import {
  HOME,
  lastDay,
  levelName,
  ParticipationPill,
  percent,
  startDay,
  StatusPill,
  zoneLabel,
} from '../../parts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campagne orale' };

const cardClass = 'rounded-big border border-line bg-surface p-5';

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <span className="block font-display text-3xl font-extrabold">{value}</span>
      <span className="text-ink-muted">{label}</span>
    </li>
  );
}

/** Une campagne orale : participation (pilote), classes à faire passer (enseignant). */
export default async function OralCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/orale/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const query = (await searchParams) ?? {};
  const res = await apiGet<OralCampaignDetail>(session.accessToken, `/oral/campaigns/${id}`);
  if (!res.ok) redirect(`${HOME}?erreur=${encodeURIComponent('Campagne introuvable.')}`);
  const c = res.data;
  const mineOnly = !c.canPilot;
  const evaluated = mineOnly ? c.myClasses.reduce((a, k) => a + k.evaluated, 0) : c.evaluated;
  const learners = mineOnly ? c.myClasses.reduce((a, k) => a + k.learners, 0) : c.learners;
  const rate = percent(evaluated, learners);
  const started = c.schools.filter((s) => s.evaluated > 0).length;
  const daysLeft = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86_400_000));
  const open = c.status !== 'close';

  const table = (rows: OralCampaignDetail['schools'], first: string, testId: string) => (
    <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label={first}>
      <table className="w-full border-collapse text-left" data-testid={testId}>
        <thead className="text-sm">
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-3">
              {first}
            </th>
            {first === 'École' && c.groupLabel && (
              <th scope="col" className="px-3 py-2">
                {c.groupLabel}
              </th>
            )}
            <th scope="col" className="px-3 py-2">
              Classes
            </th>
            <th scope="col" className="px-3 py-2">
              Élèves évalués
            </th>
            <th scope="col" className="px-3 py-2">
              État
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((s) => {
            const r = percent(s.evaluated, s.learners);
            return (
              <tr key={s.id}>
                <th scope="row" className="py-2 pr-3 font-bold">
                  {s.name}
                </th>
                {first === 'École' && c.groupLabel && <td className="px-3 py-2">{s.group}</td>}
                <td className="px-3 py-2">{s.classes}</td>
                <td className="px-3 py-2">
                  {r} %{' '}
                  <span className="text-sm text-ink-muted">
                    ({s.evaluated} sur {s.learners})
                  </span>
                </td>
                <td className="px-3 py-2">
                  {open ? (
                    <ParticipationPill rate={r} />
                  ) : s.evaluated === 0 ? (
                    <span className="font-bold">Non évaluée</span>
                  ) : (
                    <span>Évaluée</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="space-y-6">
      <Link href={HOME} className="inline-flex min-h-[44px] items-center underline">
        ← Campagnes d’évaluation
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{c.title}</h1>
          <p className="text-ink-muted">
            {zoneLabel(c)} · {levelName(c)} · du {startDay(c)} au {lastDay(c)}
          </p>
          <p className="text-ink-muted">
            Épreuve orale « {c.test.title} » · {ORAL_SUBJECT_LABELS[c.test.subject]}
            {c.createdBy ? ` · lancée par ${c.createdBy}` : ''}
          </p>
        </div>
        <StatusPill status={c.status} />
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <p className="rounded-card border-l-4 border-primary bg-primary-soft p-3">
        {open
          ? 'Chaque enseignant voit les scores de sa classe dès la passation. Les chiffres de la zone s’ouvrent à la clôture, sans nom d’élève.'
          : 'Campagne close : les résultats de la zone sont ouverts. Un élève déjà évalué ne peut plus l’être à nouveau avec cette épreuve.'}
        {!open && (
          <>
            {' '}
            <Link
              href={`/mon-espace/statistiques/campagnes/orale/${id}`}
              className="font-bold underline"
            >
              Voir les résultats par zone et par école
            </Link>
          </>
        )}
      </p>

      <ul className="grid gap-3 sm:grid-cols-3" data-testid="oral-campaign-kpis">
        <Kpi
          value={`${rate} %`}
          label={`${mineOnly ? 'de mes élèves' : 'des élèves'} évalués (${evaluated} sur ${learners})`}
        />
        {c.canPilot ? (
          <Kpi value={`${started} sur ${c.schools.length}`} label="écoles ont commencé" />
        ) : (
          <Kpi
            value={String(c.myClasses.length)}
            label={`classe${c.myClasses.length > 1 ? 's' : ''} dans la campagne`}
          />
        )}
        <Kpi
          value={c.status === 'a-venir' ? startDay(c) : open ? String(daysLeft) : 'Close'}
          label={
            c.status === 'a-venir'
              ? 'premier jour'
              : open
                ? `jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`
                : 'résultats ouverts'
          }
        />
      </ul>

      {c.myClasses.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Mes classes</h2>
          <ul className="mt-3 divide-y divide-line" data-testid="oral-campaign-my-classes">
            {c.myClasses.map((k) => (
              <li key={k.cohortId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-bold">{k.cohortName}</p>
                  <p className="text-sm text-ink-muted">
                    {k.school} · {k.evaluated} élève{k.evaluated > 1 ? 's' : ''} évalué
                    {k.evaluated > 1 ? 's' : ''} sur {k.learners}
                  </p>
                </div>
                {c.status === 'en-cours' && (
                  <Link
                    href={`/mon-espace/oral/passer?epreuve=${c.test.id}&classe=${k.cohortId}`}
                    className={buttonClass}
                  >
                    Faire passer<span className="sr-only"> en {k.cohortName}</span>
                  </Link>
                )}
                <Link
                  href={`/mon-espace/oral/resultats?epreuve=${c.test.id}&classe=${k.cohortId}`}
                  className="min-h-[44px] content-center underline"
                >
                  Résultats de la classe<span className="sr-only"> {k.cohortName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.canPilot && c.groupLabel && c.groups.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Participation par {c.groupLabel}</h2>
          <p className="text-sm text-ink-muted">
            Les plus en retard d’abord. Bon : 70 % et plus · À relancer : 50 à 69 % · En retard :
            moins de 50 %.
          </p>
          {table(c.groups, c.groupLabel, 'oral-campaign-groups')}
        </div>
      )}

      {c.canPilot && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Écoles</h2>
          {c.schools.length === 0 ? (
            <p className="mt-2">Aucune école dans la campagne.</p>
          ) : (
            table(c.schools, 'École', 'oral-campaign-schools')
          )}
        </div>
      )}

      {c.canPilot && open && (
        <div className={`${cardClass} flex flex-wrap items-center gap-3`}>
          <p className="min-w-0 flex-1 basis-60 text-sm text-ink-muted">
            La campagne se clôt seule le lendemain du dernier jour. Vous pouvez la clore plus tôt :
            les résultats de la zone s’ouvrent alors tout de suite.
          </p>
          {c.status === 'en-cours' && (
            <form action={closeOralCampaignAction}>
              <input type="hidden" name="id" value={id} />
              <PendingButton className={buttonClass} pendingLabel="Clôture…">
                Clore la campagne
              </PendingButton>
            </form>
          )}
          {c.evaluated === 0 && (
            <form action={deleteOralCampaignAction}>
              <input type="hidden" name="id" value={id} />
              <PendingButton className={secondaryButtonClass} pendingLabel="Suppression…">
                Supprimer la campagne
              </PendingButton>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
