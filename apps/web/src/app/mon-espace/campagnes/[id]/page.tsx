import type { CampaignDetail } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { closeCampaignAction, deleteCampaignAction, setCampaignModeAction } from '../actions';
import {
  HOME,
  lastDay,
  levelName,
  ParticipationPill,
  percent,
  startDay,
  StatusPill,
  zoneLabel,
} from '../parts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campagne d’évaluation' };

const cardClass = 'rounded-big border border-line bg-surface p-5';

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <span className="block font-display text-3xl font-extrabold">{value}</span>
      <span className="text-ink-muted">{label}</span>
    </li>
  );
}

/** Une campagne : participation par zone et par école (pilote), mode et saisie (école). */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const query = (await searchParams) ?? {};
  const res = await apiGet<CampaignDetail>(session.accessToken, `/authoring/campaigns/${id}`);
  if (!res.ok) redirect(`${HOME}?erreur=${encodeURIComponent('Campagne introuvable.')}`);
  const c = res.data;
  // L'école ne voit que ses classes ; le pilote voit toute la zone.
  const mineOnly = !c.canPilot;
  const submitted = mineOnly ? c.myClasses.reduce((a, k) => a + k.submitted, 0) : c.submitted;
  const learners = mineOnly ? c.myClasses.reduce((a, k) => a + k.learners, 0) : c.learners;
  const rate = percent(submitted, learners);
  const started = c.schools.filter((s) => s.submitted > 0).length;
  const daysLeft = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86_400_000));
  const open = c.status !== 'close';

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
            Épreuve « {c.exam.title} » · {c.exam.questionCount} questions · seuil {c.exam.threshold}{' '}
            %{c.createdBy ? ` · lancée par ${c.createdBy}` : ''}
          </p>
        </div>
        <StatusPill status={c.status} />
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <p className="rounded-card border-l-4 border-primary bg-primary-soft p-3">
        {open
          ? 'Les notes restent cachées aux élèves et aux enseignants jusqu’à la clôture. Ici, on suit seulement qui a composé.'
          : 'Campagne close : chaque élève et chaque enseignant voit maintenant les notes. Les résultats par domaine arriveront dans le tableau de pilotage.'}
      </p>

      <ul className="grid gap-3 sm:grid-cols-3" data-testid="campaign-kpis">
        <Kpi
          value={`${rate} %`}
          label={`${mineOnly ? 'de mes élèves' : 'des élèves'} ont composé (${submitted} sur ${learners})`}
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
                : 'notes ouvertes'
          }
        />
      </ul>

      {c.myClasses.length > 0 && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Mes classes</h2>
            <Link href={`${HOME}/${id}/livret`} className={secondaryButtonClass}>
              Livret à imprimer
            </Link>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Choisissez, pour chaque classe, en ligne (les élèves la font dans leurs devoirs) ou sur
            papier (vous imprimez le livret, puis saisissez les copies). Le choix se fige à la
            première copie.
          </p>
          <ul className="mt-3 divide-y divide-line" data-testid="campaign-my-classes">
            {c.myClasses.map((k) => (
              <li key={k.cohortId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-bold">{k.cohortName}</p>
                  <p className="text-sm text-ink-muted">
                    {k.school} · {k.submitted} copie{k.submitted > 1 ? 's' : ''} sur {k.learners}
                  </p>
                </div>
                {open && k.submitted === 0 ? (
                  <form
                    action={setCampaignModeAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="cohortId" value={k.cohortId} />
                    <fieldset className="flex gap-1 rounded-full border border-line p-1">
                      <legend className="sr-only">Mode pour {k.cohortName}</legend>
                      {[
                        ['en-ligne', 'En ligne', !k.onPaper],
                        ['papier', 'Sur papier', k.onPaper],
                      ].map(([v, label, on]) => (
                        <label
                          key={String(v)}
                          className={`cursor-pointer rounded-full px-3 py-1 text-sm font-bold has-[:checked]:bg-primary has-[:checked]:text-surface`}
                        >
                          <input
                            type="radio"
                            name="mode"
                            value={String(v)}
                            defaultChecked={Boolean(on)}
                            className="sr-only"
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    <PendingButton className={secondaryButtonClass} pendingLabel="…">
                      Enregistrer<span className="sr-only"> le mode de {k.cohortName}</span>
                    </PendingButton>
                  </form>
                ) : (
                  <span className="rounded-full bg-line px-3 py-1 text-sm font-bold">
                    {k.onPaper ? 'Sur papier' : 'En ligne'}
                  </span>
                )}
                {k.onPaper && c.status === 'en-cours' && (
                  <Link href={`${HOME}/${id}/saisie?classe=${k.cohortId}`} className={buttonClass}>
                    Saisir les copies<span className="sr-only"> de {k.cohortName}</span>
                  </Link>
                )}
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
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left" data-testid="campaign-groups">
              <thead className="text-sm">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3">
                    {c.groupLabel}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Écoles
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Ont composé
                  </th>
                  <th scope="col" className="px-3 py-2">
                    État
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.groups.map((g) => {
                  const r = percent(g.submitted, g.learners);
                  return (
                    <tr key={g.name}>
                      <th scope="row" className="py-2 pr-3 font-bold">
                        {g.name}
                      </th>
                      <td className="px-3 py-2">{g.schools}</td>
                      <td className="px-3 py-2">
                        {r} %{' '}
                        <span className="text-sm text-ink-muted">
                          ({g.submitted} sur {g.learners})
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <ParticipationPill rate={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {c.canPilot && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold">Écoles</h2>
          {c.schools.length === 0 ? (
            <p className="mt-2">Aucune école dans la campagne.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left" data-testid="campaign-schools">
                <thead className="text-sm">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3">
                      École
                    </th>
                    {c.groupLabel && (
                      <th scope="col" className="px-3 py-2">
                        {c.groupLabel}
                      </th>
                    )}
                    <th scope="col" className="px-3 py-2">
                      Classes
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Ont composé
                    </th>
                    <th scope="col" className="px-3 py-2">
                      État
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {c.schools.map((s) => {
                    const r = percent(s.submitted, s.learners);
                    return (
                      <tr key={s.id}>
                        <th scope="row" className="py-2 pr-3 font-bold">
                          {s.name}
                        </th>
                        {c.groupLabel && <td className="px-3 py-2">{s.group}</td>}
                        <td className="px-3 py-2">{s.classes}</td>
                        <td className="px-3 py-2">
                          {r} %{' '}
                          <span className="text-sm text-ink-muted">
                            ({s.submitted} sur {s.learners})
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {open ? (
                            <ParticipationPill rate={r} />
                          ) : s.submitted === 0 ? (
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
          )}
        </div>
      )}

      {c.canPilot && open && (
        <div className={`${cardClass} flex flex-wrap items-center gap-3`}>
          <p className="min-w-0 flex-1 basis-60 text-sm text-ink-muted">
            La campagne se clôt seule le lendemain du dernier jour. Vous pouvez la clore plus tôt :
            les notes s’ouvrent alors tout de suite, et plus personne ne compose.
          </p>
          {c.status === 'en-cours' && (
            <form action={closeCampaignAction}>
              <input type="hidden" name="id" value={id} />
              <PendingButton className={buttonClass} pendingLabel="Clôture…">
                Clore la campagne
              </PendingButton>
            </form>
          )}
          {c.submitted === 0 && (
            <form action={deleteCampaignAction}>
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
