import {
  AI_EXERCISE_KINDS,
  AI_MAX_EXERCISES,
  EXERCISE_DIFFICULTIES,
  EXERCISE_DIFFICULTY_LABELS,
  EXERCISE_DOMAINS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KIND_HINTS,
  EXERCISE_KIND_LABELS,
  EXERCISE_SKILLS,
  EXERCISE_SKILL_LABELS,
  type AiStatus,
  type ExerciseCompetencyOption,
  type ExerciseDetail,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { generateExercisesAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Proposer avec l’IA' };

const HOME = '/mon-espace/fabrique';
const ID = /^[0-9a-f-]{36}$/i;
const cardClass = 'space-y-4 rounded-big border border-line bg-surface p-5';

/** L'IA propose quelques exercices pour une compétence ; l'enseignant relit et corrige. */
export default async function AiExercisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(`${HOME}/ia`)}`);
  const query = await searchParams;
  const made = (param(query.faits) ?? '')
    .split(',')
    .filter((id) => ID.test(id))
    .slice(0, 10);
  const [status, orgs, comps, settings, ...drafts] = await Promise.all([
    apiGet<AiStatus>(session.accessToken, '/authoring/ai'),
    apiGet<{ items: Array<{ id: string; name: string }> }>(
      session.accessToken,
      '/authoring/exercises/organizations',
    ),
    apiGet<{ items: ExerciseCompetencyOption[] }>(
      session.accessToken,
      '/authoring/exercises/competencies',
    ),
    apiGet(session.accessToken, '/admin/ai'),
    ...made.map((id) => apiGet<ExerciseDetail>(session.accessToken, `/authoring/exercises/${id}`)),
  ]);
  const ai = status.ok ? status.data : { enabled: false, providerLabel: null, remaining: 0 };
  const organizations = orgs.ok ? orgs.data.items : [];
  const competencies = comps.ok ? comps.data.items : [];
  const groups = new Map<string, ExerciseCompetencyOption[]>();
  for (const c of competencies) {
    const label = `${c.curriculum}${c.subject ? ` · ${c.subject}` : ''}${c.level ? ` · ${c.level}` : ''}`;
    groups.set(label, [...(groups.get(label) ?? []), c]);
  }
  const proposed = drafts.flatMap((d) => (d.ok ? [d.data] : []));

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link href={HOME} className="inline-flex min-h-[44px] items-center underline">
        ← Fabrique d’exercices
      </Link>
      <h1 className="text-3xl font-extrabold">Proposer avec l’IA</h1>
      <p>
        L’IA écrit quelques exercices pour la compétence choisie. Elle ne reçoit{' '}
        <strong>aucune information sur les élèves</strong>. Ses propositions arrivent{' '}
        <strong>en brouillon</strong> : vous les relisez, les corrigez, puis les envoyez en
        relecture comme les autres.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {proposed.length > 0 && (
        <div className={cardClass} data-testid="ai-proposed">
          <h2 className="text-xl font-bold">À relire maintenant</h2>
          <ul className="space-y-2">
            {proposed.map((e) => (
              <li key={e.id}>
                <Link href={`${HOME}/${e.id}`} className="font-bold underline">
                  {e.title}
                </Link>{' '}
                <span className="text-ink-muted">
                  · {EXERCISE_KIND_LABELS[e.kind]} · {e.competency.code}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!ai.enabled ? (
        <div
          className="space-y-3 rounded-big border-2 border-line-strong bg-surface p-5"
          data-testid="ai-off"
        >
          <h2 className="text-xl font-bold">L’IA n’est pas encore branchée</h2>
          <p>
            Elle est éteinte tant que le superadministrateur ne l’a pas allumée. En attendant, vous
            pouvez{' '}
            <Link href={`${HOME}/nouveau`} className="font-bold underline">
              créer un exercice
            </Link>{' '}
            vous-même ou{' '}
            <Link href={`${HOME}/importer`} className="font-bold underline">
              importer un fichier
            </Link>
            .
          </p>
          {settings.ok && (
            <p>
              <Link href="/mon-espace/configuration/ia" className={buttonClass}>
                Brancher l’IA
              </Link>
            </p>
          )}
        </div>
      ) : organizations.length === 0 ? (
        <p>Vous ne pouvez rédiger d’exercice pour aucune structure.</p>
      ) : competencies.length === 0 ? (
        <p>Aucun programme publié : publiez d’abord un programme dans Contenus &gt; Programmes.</p>
      ) : ai.remaining === 0 ? (
        <p className="rounded-card border-2 border-line-strong p-4 font-bold">
          Limite du jour atteinte pour l’IA. Réessayez demain.
        </p>
      ) : (
        <form action={generateExercisesAction} className="space-y-6">
          <p className="text-ink-muted">
            IA utilisée : {ai.providerLabel}. Encore {ai.remaining} demande
            {ai.remaining > 1 ? 's' : ''} aujourd’hui.
          </p>
          <fieldset className={cardClass}>
            <legend className="px-1 font-display text-xl font-bold">1. Ce qu’on évalue</legend>
            <label className="block font-bold">
              Compétence du programme
              <select name="competencyId" required className={inputClass}>
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
          </fieldset>

          <fieldset className={cardClass}>
            <legend className="px-1 font-display text-xl font-bold">2. Type d’exercice</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {AI_EXERCISE_KINDS.map((k, i) => (
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

          <fieldset className={cardClass}>
            <legend className="px-1 font-display text-xl font-bold">3. Combien, et pour qui</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold">
                Nombre d’exercices
                <select name="count" defaultValue="3" className={inputClass}>
                  {Array.from({ length: AI_MAX_EXERCISES }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
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
            </div>
            <label className="block font-bold">
              Précisions (facultatif)
              <textarea
                name="notes"
                maxLength={500}
                rows={3}
                className={inputClass}
                placeholder="Exemple : thème du marché, nombres jusqu’à 100."
              />
              <span className="mt-1 block text-sm font-normal text-ink-muted">
                N’écrivez aucun nom d’élève.
              </span>
            </label>
          </fieldset>

          <PendingButton className={buttonClass} pendingLabel="L’IA écrit… (jusqu’à une minute)">
            Proposer les exercices
          </PendingButton>
        </form>
      )}
    </section>
  );
}
