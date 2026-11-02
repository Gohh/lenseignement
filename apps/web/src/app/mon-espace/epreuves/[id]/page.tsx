import {
  EXAM_MODEL_INFO,
  EXERCISE_DIFFICULTY_LABELS,
  EXERCISE_DOMAIN_LABELS,
  EXERCISE_KIND_LABELS,
  EXERCISE_SKILL_LABELS,
  type ExamDetail,
} from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet, type CohortSummary } from '@/lib/api';
import { getSession } from '@/lib/session';
import {
  deleteExamAction,
  examItemAction,
  giveExamAction,
  reassembleExamAction,
  updateExamAction,
} from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Épreuve' };

const HOME = '/mon-espace/epreuves';
const small =
  'inline-flex min-h-[44px] items-center rounded-card border border-line-strong bg-surface px-3 text-sm font-bold text-ink hover:bg-primary-soft';

export default async function ExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/${id}`);
  const query = (await searchParams) ?? {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const [res, cohortsRes] = await Promise.all([
    apiGet<ExamDetail>(session.accessToken, `/authoring/exams/${id}`),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
  ]);
  if (!res.ok) redirect(`${HOME}?erreur=${encodeURIComponent('Épreuve introuvable.')}`);
  const exam = res.data;
  const givenIds = new Set(exam.given.map((g) => g.cohortId));
  const cohorts = (cohortsRes.ok ? cohortsRes.data : []).filter((c) => !givenIds.has(c.id));
  const editable = exam.canEdit && !exam.locked;
  const missing = exam.plan.filter((p) => p.chosen < p.target);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Link href={HOME} className="inline-flex min-h-[44px] items-center underline">
        ← Épreuves
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{exam.title}</h1>
          <p className="text-ink-muted">
            {EXAM_MODEL_INFO[exam.model].label} · {exam.items.length} question
            {exam.items.length > 1 ? 's' : ''} · {exam.durationMinutes} min · seuil {exam.threshold}{' '}
            %
          </p>
          <p className="text-sm text-ink-muted">
            {exam.organization.name} · {exam.curriculum}
            {exam.author ? ` · composée par ${exam.author}` : ''}
          </p>
        </div>
        {exam.given.length > 0 && (
          <Link href={`${HOME}/${exam.id}/resultats`} className={buttonClass}>
            Voir les résultats
          </Link>
        )}
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <section className="space-y-3 rounded-big border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-bold">Plan de l’épreuve</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-sm text-ink-muted">
              <tr>
                <th className="py-2 pr-3">Domaine</th>
                <th className="py-2 pr-3">Part</th>
                <th className="py-2 pr-3">Prévu</th>
                <th className="py-2 pr-3">Choisi</th>
                <th className="py-2">Dans la banque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {exam.plan.map((p) => (
                <tr key={p.domain}>
                  <td className="py-2 pr-3 font-bold">{EXERCISE_DOMAIN_LABELS[p.domain]}</td>
                  <td className="py-2 pr-3">{p.share} %</td>
                  <td className="py-2 pr-3">{p.target}</td>
                  <td className={`py-2 pr-3 ${p.chosen < p.target ? 'font-bold text-error' : ''}`}>
                    {p.chosen}
                  </td>
                  <td className="py-2">{p.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && (
          <p className="rounded-card bg-accent-soft p-3 text-accent-ink">
            Il manque des exercices publiés en{' '}
            {missing.map((m) => EXERCISE_DOMAIN_LABELS[m.domain]).join(', ')}. Créez-en dans la
            Fabrique, puis refaites le tirage ; ou donnez l’épreuve telle quelle.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-big border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Questions</h2>
          {editable && (
            <form action={reassembleExamAction}>
              <input type="hidden" name="id" value={exam.id} />
              <button type="submit" className={secondaryButtonClass}>
                Refaire le tirage
              </button>
            </form>
          )}
        </div>
        {exam.locked && (
          <p className="text-sm text-ink-muted">
            L’épreuve est déjà donnée : ses questions ne changent plus, pour que toutes les classes
            passent la même.
          </p>
        )}
        {exam.items.length === 0 ? (
          <p>Aucune question : la banque n’a pas encore d’exercice publié pour ces domaines.</p>
        ) : (
          <ol className="divide-y divide-line" data-testid="exam-items">
            {exam.items.map((item) => (
              <li key={item.exerciseId} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-8 font-display text-lg font-bold text-ink-muted">
                  {item.position}
                </span>
                <div className="min-w-0 flex-1 basis-60">
                  <Link
                    href={`/mon-espace/fabrique/${item.exerciseId}`}
                    className="font-bold underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-sm text-ink-muted">
                    {EXERCISE_DOMAIN_LABELS[item.domain]} · {item.competencyCode} ·{' '}
                    {EXERCISE_KIND_LABELS[item.kind]} ·{' '}
                    {EXERCISE_DIFFICULTY_LABELS[item.difficulty]} ·{' '}
                    {EXERCISE_SKILL_LABELS[item.skill]}
                  </p>
                </div>
                {editable && (
                  <div className="flex gap-2">
                    <form action={examItemAction}>
                      <input type="hidden" name="id" value={exam.id} />
                      <input type="hidden" name="exerciseId" value={item.exerciseId} />
                      <input type="hidden" name="step" value="replace" />
                      <button
                        type="submit"
                        className={small}
                        aria-label={`Remplacer : ${item.title}`}
                      >
                        Remplacer
                      </button>
                    </form>
                    <form action={examItemAction}>
                      <input type="hidden" name="id" value={exam.id} />
                      <input type="hidden" name="exerciseId" value={item.exerciseId} />
                      <input type="hidden" name="step" value="remove" />
                      <button
                        type="submit"
                        className={small}
                        aria-label={`Retirer : ${item.title}`}
                      >
                        Retirer
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3 rounded-big border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-bold">Donner à des classes</h2>
        <p className="text-sm text-ink-muted">
          Chaque classe la reçoit dans ses devoirs. Les élèves la font en ligne, ou sur l’appareil
          sans connexion ; la plateforme corrige et la note s’affiche tout de suite.
        </p>
        {cohorts.length === 0 ? (
          <p>
            {exam.given.length
              ? 'Toutes vos classes l’ont déjà reçue.'
              : 'Vous ne suivez aucune classe : seul l’enseignant de la classe ou sa direction peut la donner.'}
          </p>
        ) : exam.items.length < 4 ? (
          <p>Il faut au moins quatre questions pour la donner.</p>
        ) : (
          <form action={giveExamAction} className="space-y-4">
            <input type="hidden" name="id" value={exam.id} />
            <fieldset className="space-y-2">
              <legend className="font-bold">Classes</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {cohorts.map((c) => (
                  <label
                    key={c.id}
                    className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-card border border-line-strong px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                  >
                    <input type="checkbox" name="cohortIds" value={c.id} className="h-5 w-5" />
                    <span>
                      <span className="font-bold">{c.name}</span>{' '}
                      <span className="text-sm text-ink-muted">
                        · {c.organization.name} · {c.learnerCount} élève
                        {c.learnerCount > 1 ? 's' : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block max-w-xs font-bold">
              À rendre avant (facultatif)
              <input type="datetime-local" name="dueAt" className={inputClass} />
            </label>
            <PendingButton className={buttonClass} pendingLabel="Envoi en cours…">
              Donner l’épreuve
            </PendingButton>
          </form>
        )}
        {exam.given.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="font-bold">Déjà donnée à</h3>
            <ul className="divide-y divide-line">
              {exam.given.map((g) => (
                <li key={g.assignmentId} className="flex flex-wrap items-center gap-3 py-2">
                  <Link
                    href={`/mon-espace/devoirs/${g.assignmentId}`}
                    className="font-bold underline"
                  >
                    {g.cohortName}
                  </Link>
                  <span className="text-sm text-ink-muted">
                    {g.submissionCount} copie{g.submissionCount > 1 ? 's' : ''} sur {g.learnerCount}{' '}
                    élève{g.learnerCount > 1 ? 's' : ''}
                    {g.dueAt
                      ? ` · avant le ${new Date(g.dueAt).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {exam.canEdit && (
        <section className="space-y-3 rounded-big border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-bold">Réglages</h2>
          <form action={updateExamAction} className="space-y-4">
            <input type="hidden" name="id" value={exam.id} />
            <label className="block font-bold">
              Titre
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={exam.title}
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold">
                Durée (minutes)
                <input
                  type="number"
                  name="durationMinutes"
                  min={5}
                  max={240}
                  defaultValue={exam.durationMinutes}
                  className={inputClass}
                />
              </label>
              <label className="block font-bold">
                Seuil de réussite (%)
                <input
                  type="number"
                  name="threshold"
                  min={1}
                  max={100}
                  defaultValue={exam.threshold}
                  className={inputClass}
                />
              </label>
            </div>
            <button type="submit" className={secondaryButtonClass}>
              Enregistrer
            </button>
          </form>
          {exam.given.length === 0 && !exam.locked && (
            <details>
              <summary className="inline-flex min-h-[44px] cursor-pointer items-center font-bold text-error underline">
                Supprimer l’épreuve
              </summary>
              <form action={deleteExamAction} className="mt-2 flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={exam.id} />
                <span>Elle n’a été donnée à aucune classe. La supprimer pour de bon ?</span>
                <button type="submit" className={secondaryButtonClass}>
                  Oui, supprimer
                </button>
              </form>
            </details>
          )}
        </section>
      )}
    </section>
  );
}
