import {
  LEVEL_GROUPS,
  levelLabel,
  type CampaignOptions,
  type CampaignPreview,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createCampaignAction } from '../actions';
import { HOME } from '../parts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lancer une campagne' };

const UUID = /^[0-9a-f-]{36}$/i;
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/**
 * Lancer : l'épreuve, la zone, le niveau, les dates. « Voir les classes concernées » compte les
 * écoles, classes et élèves touchés avant de lancer.
 */
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/nouvelle`);
  const query = (await searchParams) ?? {};
  const res = await apiGet<CampaignOptions>(session.accessToken, '/authoring/campaigns/options');
  const { zones, exams } = res.ok ? res.data : { zones: [], exams: [] };
  const value = {
    title: param(query.title) ?? '',
    zone: param(query.zone) ?? zones[0]?.id ?? 'pays',
    level: param(query.level) ?? '',
    examId: param(query.examId) ?? '',
    startsAt: param(query.startsAt) ?? day(0),
    endsAt: param(query.endsAt) ?? day(14),
  };
  const ready =
    value.title !== '' &&
    UUID.test(value.examId) &&
    value.level !== '' &&
    (value.zone === 'pays' || UUID.test(value.zone));
  const preview = ready
    ? await apiGet<CampaignPreview>(
        session.accessToken,
        `/authoring/campaigns/preview?zone=${value.zone}&level=${encodeURIComponent(value.level)}`,
      )
    : null;
  const zoneName = zones.find((z) => (z.id ?? 'pays') === value.zone)?.name ?? '';
  const exam = exams.find((e) => e.id === value.examId);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link href={HOME} className="inline-flex min-h-[44px] items-center underline">
        ← Campagnes d’évaluation
      </Link>
      <h1 className="text-3xl font-extrabold">Lancer une campagne</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {zones.length === 0 ? (
        <p>
          Vous ne lancez pas de campagne. Elles sont lancées par l’administration, les directions
          centrales, les DRENA et les IEPP.
        </p>
      ) : exams.length === 0 ? (
        <p>
          Aucune épreuve d’au moins quatre questions dans votre zone.{' '}
          <Link href="/mon-espace/epreuves" className="underline">
            Préparez d’abord une épreuve
          </Link>
          .
        </p>
      ) : (
        <>
          <form method="get" className="space-y-5 rounded-big border border-line bg-surface p-5">
            <label className="block font-bold">
              Titre de la campagne
              <input
                name="title"
                className={inputClass}
                required
                maxLength={120}
                defaultValue={value.title}
                placeholder="Évaluation de mi-année CM1"
              />
            </label>
            <label className="block font-bold">
              Épreuve
              <select name="examId" className={inputClass} required defaultValue={value.examId}>
                <option value="">Choisir…</option>
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {e.itemCount} questions · {e.organization}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold">
                Zone
                <select name="zone" className={inputClass} required defaultValue={value.zone}>
                  {zones.map((z) => (
                    <option key={z.id ?? 'pays'} value={z.id ?? 'pays'}>
                      {z.kind === 'pays'
                        ? z.name
                        : `${z.kind === 'iepp' ? 'IEPP' : 'DRENA'} ${z.name}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Niveau
                <select name="level" className={inputClass} required defaultValue={value.level}>
                  <option value="">Choisir…</option>
                  {LEVEL_GROUPS.map((g) => (
                    <optgroup key={g.code} label={g.title}>
                      {g.levels.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Premier jour
                <input
                  type="date"
                  name="startsAt"
                  className={inputClass}
                  required
                  defaultValue={value.startsAt}
                />
              </label>
              <label className="block font-bold">
                Dernier jour
                <input
                  type="date"
                  name="endsAt"
                  className={inputClass}
                  required
                  defaultValue={value.endsAt}
                />
              </label>
            </div>
            <p className="text-sm text-ink-muted">
              Toutes les classes de ce niveau dans les écoles de la zone reçoivent l’épreuve. Chaque
              école choisit ensuite, classe par classe, en ligne ou sur papier. Les élèves la voient
              le premier jour ; les notes restent cachées jusqu’au lendemain du dernier jour.
            </p>
            <button type="submit" className={ready ? secondaryButtonClass : buttonClass}>
              Voir les classes concernées
            </button>
          </form>

          {preview && (
            <div
              className="space-y-4 rounded-big border-2 border-primary bg-primary-soft p-5"
              data-testid="campaign-preview"
            >
              {preview.ok ? (
                <>
                  <h2 className="text-xl font-bold">Avant de lancer</h2>
                  <p>
                    « {exam?.title} » sera passée en {levelLabel(value.level) ?? value.level} ·{' '}
                    {zoneName} :
                  </p>
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {[
                      [preview.data.schools, 'école'],
                      [preview.data.classes, 'classe'],
                      [preview.data.learners, 'élève'],
                    ].map(([n, word]) => (
                      <li key={word} className="rounded-card bg-surface p-3">
                        <span className="block font-display text-3xl font-extrabold">{n}</span>
                        {word}
                        {Number(n) > 1 ? 's' : ''}
                      </li>
                    ))}
                  </ul>
                  {preview.data.classes === 0 ? (
                    <p className="font-bold">
                      Aucune classe de ce niveau dans la zone : changez le niveau ou la zone.
                    </p>
                  ) : (
                    <form action={createCampaignAction}>
                      {Object.entries(value).map(([name, v]) => (
                        <input key={name} type="hidden" name={name} value={v} />
                      ))}
                      <PendingButton className={buttonClass} pendingLabel="Lancement…">
                        Lancer la campagne
                      </PendingButton>
                    </form>
                  )}
                </>
              ) : (
                <p role="alert" className="font-bold text-error">
                  Cette zone n’est pas dans votre portée.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
