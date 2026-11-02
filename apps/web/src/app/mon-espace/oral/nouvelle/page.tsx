import {
  LEVEL_GROUPS,
  ORAL_MODEL_LABELS,
  ORAL_MODELS,
  ORAL_SUBJECT_LABELS,
  ORAL_SUBJECTS,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { inputClass, Notice, param, buttonClass } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createOralTestAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Créer une épreuve orale' };

/** Création : structure, matière, niveau, et un modèle de parties à remplir. */
export default async function NewOralTestPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/oral/nouvelle');
  const query = (await searchParams) ?? {};
  const orgs = await apiGet<{ items: Array<{ id: string; name: string }> }>(
    session.accessToken,
    '/authoring/exercises/organizations',
  );
  const organizations = orgs.ok ? orgs.data.items : [];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link href="/mon-espace/oral" className="inline-flex min-h-[44px] items-center underline">
        ← Évaluations orales
      </Link>
      <h1 className="text-3xl font-extrabold">Créer une épreuve orale</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {organizations.length === 0 ? (
        <p>Vous ne rédigez pour aucune structure.</p>
      ) : (
        <form action={createOralTestAction} className="space-y-6">
          <fieldset className="space-y-4 rounded-big border border-line bg-surface p-5">
            <legend className="px-1 font-display text-xl font-bold">1. L’épreuve</legend>
            <label className="block font-bold">
              Titre
              <input
                name="title"
                required
                maxLength={120}
                placeholder="Ex. : Lecture à voix haute, CP1, début d’année"
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block font-bold">
                Structure
                <select name="organizationId" required className={inputClass}>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Matière
                <select name="subject" className={inputClass}>
                  {ORAL_SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {ORAL_SUBJECT_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Niveau
                <select name="level" required className={inputClass} defaultValue="cp1">
                  {LEVEL_GROUPS.map((group) => (
                    <optgroup key={group.code} label={group.title}>
                      {group.levels.map((level) => (
                        <option key={level.code} value={level.code}>
                          {group.title} {level.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset className="space-y-3 rounded-big border border-line bg-surface p-5">
            <legend className="px-1 font-display text-xl font-bold">2. Le modèle</legend>
            <p className="text-sm text-ink-muted">
              Le modèle donne les parties, avec des exemples écrits pour la plateforme. Aucun
              élément d’une évaluation officielle n’est copié : remplacez-les par les vôtres.
            </p>
            {ORAL_MODELS.map((m, i) => (
              <label key={m} className="flex min-h-[44px] items-center gap-3">
                <input type="radio" name="model" value={m} defaultChecked={i === 0} />
                {ORAL_MODEL_LABELS[m]}
              </label>
            ))}
            <label className="flex min-h-[44px] items-center gap-3">
              <input type="radio" name="model" value="" />
              Page blanche (une partie à remplir)
            </label>
          </fieldset>
          <PendingButton className={buttonClass} pendingLabel="Création…">
            Créer l’épreuve
          </PendingButton>
        </form>
      )}
    </section>
  );
}
