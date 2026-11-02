import {
  EXERCISE_DIFFICULTIES,
  EXERCISE_DIFFICULTY_LABELS,
  EXERCISE_DOMAINS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KINDS,
  EXERCISE_KIND_HINTS,
  EXERCISE_KIND_LABELS,
  EXERCISE_SKILLS,
  EXERCISE_SKILL_LABELS,
  type ExerciseCompetencyOption,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createExerciseAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Créer un exercice' };

/** Création : on part toujours d'une compétence d'un programme publié. */
export default async function NewExercisePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/fabrique/nouveau');
  const query = (await searchParams) ?? {};
  const [orgs, comps] = await Promise.all([
    apiGet<{ items: Array<{ id: string; name: string }> }>(
      session.accessToken,
      '/authoring/exercises/organizations',
    ),
    apiGet<{ items: ExerciseCompetencyOption[] }>(
      session.accessToken,
      '/authoring/exercises/competencies',
    ),
  ]);
  const organizations = orgs.ok ? orgs.data.items : [];
  const competencies = comps.ok ? comps.data.items : [];
  const groups = new Map<string, ExerciseCompetencyOption[]>();
  for (const c of competencies) {
    const label = `${c.curriculum}${c.subject ? ` · ${c.subject}` : ''}${c.level ? ` · ${c.level}` : ''}`;
    groups.set(label, [...(groups.get(label) ?? []), c]);
  }
  const picked = param(query.competence) ?? '';

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link href="/mon-espace/fabrique" className="inline-flex min-h-[44px] items-center underline">
        ← Fabrique d’exercices
      </Link>
      <h1 className="text-3xl font-extrabold">Créer un exercice</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {organizations.length === 0 ? (
        <p>Vous ne pouvez rédiger d’exercice pour aucune structure.</p>
      ) : competencies.length === 0 ? (
        <p>
          Aucun programme publié pour l’instant. Un exercice se rattache toujours à une compétence
          d’un programme : publiez d’abord un programme dans Contenus &gt; Programmes.
        </p>
      ) : (
        <form action={createExerciseAction} className="space-y-6">
          <fieldset className="space-y-4 rounded-big border border-line bg-surface p-5">
            <legend className="px-1 font-display text-xl font-bold">1. Ce qu’on évalue</legend>
            <label className="block font-bold">
              Compétence du programme
              <select name="competencyId" required defaultValue={picked} className={inputClass}>
                <option value="">Choisir…</option>
                {[...groups.entries()].map(([label, list]) => (
                  <optgroup key={label} label={label}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} {c.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block font-bold">
                Domaine
                <select name="domain" required className={inputClass}>
                  {EXERCISE_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {EXERCISE_DOMAIN_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Difficulté
                <select name="difficulty" required defaultValue="moyen" className={inputClass}>
                  {EXERCISE_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {EXERCISE_DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                L’élève doit
                <select name="skill" required defaultValue="appliquer" className={inputClass}>
                  {EXERCISE_SKILLS.map((s) => (
                    <option key={s} value={s}>
                      {EXERCISE_SKILL_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-sm text-ink-muted">
              Connaître : se souvenir d’un fait, d’une règle. Appliquer : utiliser ce qu’on sait
              dans un cas simple. Raisonner : résoudre un problème nouveau, justifier.
            </p>
          </fieldset>

          <fieldset className="space-y-3 rounded-big border border-line bg-surface p-5">
            <legend className="px-1 font-display text-xl font-bold">2. Type d’exercice</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {EXERCISE_KINDS.map((k, i) => (
                <label
                  key={k}
                  className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-card border border-line-strong p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k}
                    required
                    defaultChecked={i === 0}
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    <span className="block font-bold">{EXERCISE_KIND_LABELS[k]}</span>
                    <span className="block text-sm text-ink-muted">{EXERCISE_KIND_HINTS[k]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-4 rounded-big border border-line bg-surface p-5">
            <legend className="px-1 font-display text-xl font-bold">3. Titre et structure</legend>
            <label className="block font-bold">
              Titre
              <input
                name="title"
                required
                maxLength={120}
                className={inputClass}
                placeholder="Exemple : partager 24 mangues entre 4 enfants"
              />
            </label>
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
          </fieldset>

          <button type="submit" className={buttonClass}>
            Créer et écrire l’exercice
          </button>
        </form>
      )}
    </section>
  );
}
