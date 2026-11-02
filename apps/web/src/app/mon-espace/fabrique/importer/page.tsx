import type { ExerciseCompetencyOption } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExerciseImportForm } from '@/components/ExerciseImportForm';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { importExercisesAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Importer des exercices' };

/** Import d'un fichier d'exercices préparé à l'avance : ils partent en relecture. */
export default async function ImportExercisesPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/fabrique/importer');
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
    ...new Map((comps.ok ? comps.data.items : []).map((c) => [c.curriculumId, c.curriculum])),
  ].map(([id, label]) => ({ id, label }));

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link href="/mon-espace/fabrique" className="inline-flex min-h-[44px] items-center underline">
        ← Fabrique d’exercices
      </Link>
      <h1 className="text-3xl font-extrabold">Importer des exercices</h1>
      <div className="space-y-2">
        <p>
          Importez d’un coup une série d’exercices préparée à l’avance (par exemple avec l’aide
          d’une IA, puis vérifiée). Chaque exercice est rattaché à une compétence par son code, dans
          le programme choisi ci-dessous. Les exercices importés partent{' '}
          <strong>en relecture</strong> : rien n’arrive aux élèves sans avoir été relu.
        </p>
        <p>
          <a href="/modele-exercices.json" download className="font-bold underline">
            Télécharger le fichier modèle
          </a>{' '}
          (un exemple de chaque type d’exercice).
        </p>
      </div>
      {organizations.length === 0 ? (
        <p>Vous ne pouvez rédiger d’exercice pour aucune structure.</p>
      ) : curricula.length === 0 ? (
        <p>
          Aucun programme publié : publiez d’abord un programme dans Configuration &gt; Programmes.
        </p>
      ) : (
        <ExerciseImportForm
          action={importExercisesAction}
          organizations={organizations}
          curricula={curricula}
        />
      )}
    </section>
  );
}
