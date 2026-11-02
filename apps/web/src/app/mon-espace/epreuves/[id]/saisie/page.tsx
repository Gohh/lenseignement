import type { ExamPaperSheet } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { PaperGrid } from '@/components/PaperGrid';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { saveExamPaperAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saisir les copies' };

const HOME = '/mon-espace/epreuves';
const UUID = /^[0-9a-f-]{36}$/i;

/** Grille de saisie : une ligne par élève, une case par question (cochée = juste). */
export default async function ExamPaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const cohort = param(query.classe) ?? '';
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/${id}`);
  if (!UUID.test(id) || !UUID.test(cohort)) redirect(`${HOME}/${UUID.test(id) ? id : ''}`);
  const res = await apiGet<ExamPaperSheet>(
    session.accessToken,
    `/authoring/exams/${id}/paper?cohort=${cohort}`,
  );
  if (!res.ok) {
    redirect(`${HOME}/${id}?erreur=${encodeURIComponent('Cette classe n’a pas reçu l’épreuve.')}`);
  }
  const sheet = res.data;

  return (
    <section className="space-y-6">
      <Link href={`${HOME}/${id}`} className="inline-flex min-h-[44px] items-center underline">
        ← {sheet.exam.title}
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold">Saisir les copies · {sheet.cohort.name}</h1>
        <p className="max-w-3xl text-ink-muted">
          Cochez « Copie » pour chaque élève qui a rendu sa feuille, puis cochez les réponses justes
          ; une case vide compte faux. Le corrigé est sur la page « Voir le corrigé ». Décocher «
          Copie » efface la copie saisie.
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <PaperGrid sheet={sheet} action={saveExamPaperAction} hidden={{ id }} />
    </section>
  );
}
