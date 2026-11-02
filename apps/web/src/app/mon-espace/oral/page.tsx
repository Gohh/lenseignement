import {
  levelLabel,
  ORAL_SUBJECT_LABELS,
  type OralOverview,
  type OralTestSummary,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Évaluations orales' };

const HOME = '/mon-espace/oral';

function TestLine({ t }: { t: OralTestSummary }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <Link href={`${HOME}/${t.id}`} className="font-display text-lg font-bold underline">
          {t.title}
        </Link>
        <p className="text-sm text-ink-muted">
          {ORAL_SUBJECT_LABELS[t.subject]} · {levelLabel(t.level) ?? t.level} · {t.partCount} partie
          {t.partCount > 1 ? 's' : ''} · {t.organization.name}
          {t.author ? ` · ${t.author}` : ''}
        </p>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-sm font-bold ${
          t.status === 'publiee' ? 'bg-primary-soft text-primary' : 'bg-line text-ink'
        }`}
      >
        {t.status === 'publiee'
          ? `Publiée · ${t.resultCount} élève${t.resultCount > 1 ? 's' : ''}`
          : t.canPublish
            ? 'Brouillon · à publier'
            : 'Brouillon'}
      </span>
    </li>
  );
}

/** Évaluations orales chronométrées : faire passer, lire les résultats, rédiger. */
export default async function OralPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}`);
  const query = (await searchParams) ?? {};
  const res = await apiGet<OralOverview>(session.accessToken, '/oral');
  const data: OralOverview = res.ok
    ? res.data
    : { tests: [], classes: [], done: [], organizations: [], superadmin: false };
  const published = data.tests.filter((t) => t.status === 'publiee');
  const drafts = data.tests.filter((t) => t.status === 'brouillon');
  const canAuthor = data.organizations.length > 0;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Évaluations orales</h1>
          <p className="max-w-2xl text-ink-muted">
            L’élève lit ou compte à voix haute pendant une minute ; vous touchez ce qui est faux sur
            votre écran. La plateforme calcule le score par minute. Aucune voix n’est enregistrée,
            et la passation marche aussi sans connexion une fois la page ouverte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.superadmin && (
            <Link href={`${HOME}/reperes`} className={secondaryButtonClass}>
              Repères
            </Link>
          )}
          {canAuthor && (
            <Link href={`${HOME}/nouvelle`} className={buttonClass}>
              Créer une épreuve orale
            </Link>
          )}
        </div>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <div
        className="space-y-3 rounded-big border border-line bg-surface p-5"
        data-testid="oral-run"
      >
        <h2 className="font-display text-2xl font-bold">Faire passer</h2>
        {data.classes.length === 0 ? (
          <p>Vous n’avez pas de classe où faire passer une épreuve orale.</p>
        ) : published.length === 0 ? (
          <p>Aucune épreuve orale publiée pour l’instant.</p>
        ) : (
          <form
            action={`${HOME}/passer`}
            method="get"
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <label className="block font-bold">
              Classe
              <select name="classe" required className={inputClass}>
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.school} ({c.learners} élève{c.learners > 1 ? 's' : ''})
                    {c.visit ? ' · visite' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-bold">
              Épreuve
              <select name="epreuve" required className={inputClass}>
                {published.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({levelLabel(t.level) ?? t.level})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonClass}>
              Commencer
            </button>
          </form>
        )}
      </div>

      {data.done.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-bold">Résultats des classes</h2>
          <ul className="divide-y divide-line rounded-big border border-line bg-surface px-5">
            {data.done.map((d) => (
              <li
                key={`${d.testId}-${d.cohortId}`}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1 basis-60">
                  <Link
                    href={`${HOME}/resultats?epreuve=${d.testId}&classe=${d.cohortId}`}
                    className="font-display text-lg font-bold underline"
                  >
                    {d.testTitle} · {d.cohortName}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {d.school} · dernière passation le{' '}
                    {new Date(d.lastAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
                  {d.evaluated} / {d.learners} élève{d.learners > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(canAuthor || drafts.length > 0) && (
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-bold">Brouillons</h2>
          {drafts.length === 0 ? (
            <p className="rounded-big border border-line bg-surface p-5">
              Aucun brouillon. Créez une épreuve à partir d’un modèle : les exemples sont à
              remplacer par vos propres lettres, mots, textes ou calculs.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-big border border-line bg-surface px-5">
              {drafts.map((t) => (
                <TestLine key={t.id} t={t} />
              ))}
            </ul>
          )}
        </div>
      )}

      {published.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-bold">Épreuves publiées</h2>
          <ul className="divide-y divide-line rounded-big border border-line bg-surface px-5">
            {published.map((t) => (
              <TestLine key={t.id} t={t} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
