import type { ExamPaperSheet } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { PaperGrid } from '@/components/PaperGrid';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { saveCampaignPaperAction } from '../../actions';
import { HOME } from '../../parts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saisir les copies' };

const UUID = /^[0-9a-f-]{36}$/i;

/** Copies papier d'une classe de la campagne : mêmes cases que pour une épreuve de classe. */
export default async function CampaignPaperPage({
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
    `/authoring/campaigns/${id}/paper?cohort=${cohort}`,
  );
  if (!res.ok) {
    redirect(
      `${HOME}/${id}?erreur=${encodeURIComponent('Cette classe n’est pas dans la campagne.')}`,
    );
  }
  const sheet = res.data;

  return (
    <section className="space-y-6">
      <Link href={`${HOME}/${id}`} className="inline-flex min-h-[44px] items-center underline">
        ← Retour à la campagne
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold">Saisir les copies · {sheet.cohort.name}</h1>
        <p className="max-w-3xl text-ink-muted">
          Cochez « Copie » pour chaque élève qui a rendu sa feuille, puis cochez les réponses justes
          ; une case vide compte faux. Le corrigé est dans le livret (« Voir le corrigé »). Les
          notes restent cachées aux élèves jusqu’à la fin de la campagne.
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <PaperGrid sheet={sheet} action={saveCampaignPaperAction} hidden={{ id }} />
    </section>
  );
}
