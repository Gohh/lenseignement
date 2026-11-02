import { EXAM_DEFAULT_THRESHOLD, type ExerciseCompetencyOption } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExamModelPicker } from '@/components/ExamModelPicker';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { PendingButton } from '@/components/PendingButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createExamAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Créer une épreuve' };

/** Création : un modèle (parts par domaine), un programme, le nombre de questions. */
export default async function NewExamPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/epreuves/nouvelle');
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
  const curricula = [
    ...new Map(
      (comps.ok ? comps.data.items : []).map((c) => [c.curriculumId, c.curriculum]),
    ).entries(),
  ];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link href="/mon-espace/epreuves" className="inline-flex min-h-[44px] items-center underline">
        ← Épreuves
      </Link>
      <h1 className="text-3xl font-extrabold">Créer une épreuve</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {organizations.length === 0 ? (
        <p>Vous ne pouvez composer d’épreuve pour aucune structure.</p>
      ) : curricula.length === 0 ? (
        <p>Aucun programme publié pour l’instant : publiez d’abord un programme.</p>
      ) : (
        <form action={createExamAction} className="space-y-6">
          <fieldset className="space-y-4 rounded-big border border-line bg-surface p-5">
            <legend className="px-1 font-display text-xl font-bold">1. Le modèle</legend>
            <p className="text-sm text-ink-muted">
              Le modèle donne la part de chaque domaine, comme dans les grandes évaluations. Les
              questions viennent toujours de votre banque : aucune question officielle n’est copiée.
            </p>
            <ExamModelPicker />
          </fieldset>

          <fieldset className="space-y-4 rounded-big border border-line bg-surface p-5">
            <legend className="px-1 font-display text-xl font-bold">2. L’épreuve</legend>
            <label className="block font-bold">
              Titre
              <input
                name="title"
                required
                maxLength={120}
                placeholder="Ex. : Épreuve de maths, fin de CM2"
                className={inputClass}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold">
                Programme
                <select name="curriculumVersionId" required className={inputClass}>
                  {curricula.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
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
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block font-bold">
                Nombre de questions
                <input
                  type="number"
                  name="questionCount"
                  min={4}
                  max={40}
                  defaultValue={20}
                  required
                  className={inputClass}
                />
              </label>
              <label className="block font-bold">
                Durée (minutes)
                <input
                  type="number"
                  name="durationMinutes"
                  min={5}
                  max={240}
                  defaultValue={45}
                  required
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
                  defaultValue={EXAM_DEFAULT_THRESHOLD}
                  required
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-sm text-ink-muted">
              Le seuil sert à lire les résultats : « tant d’élèves au-dessus du seuil ».
            </p>
          </fieldset>
          <PendingButton className={buttonClass} pendingLabel="Composition en cours…">
            Composer l’épreuve
          </PendingButton>
        </form>
      )}
    </section>
  );
}
