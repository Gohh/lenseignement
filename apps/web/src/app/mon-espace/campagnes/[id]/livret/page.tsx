import type { ExamBooklet } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { ExamBookletView } from '@/components/ExamBookletView';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { HOME } from '../../parts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Livret de la campagne' };

/** Livret de l'épreuve de la campagne, ou son corrigé (`?version=corrige`), pour les écoles. */
export default async function CampaignBookletPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${HOME}/${id}/livret`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(HOME);
  const answerKey = ((await searchParams) ?? {}).version === 'corrige';
  const res = await apiGet<ExamBooklet & { campaign: { id: string; title: string } }>(
    session.accessToken,
    `/authoring/campaigns/${id}/booklet`,
  );
  if (!res.ok) redirect(`${HOME}?erreur=${encodeURIComponent('Campagne introuvable.')}`);
  return (
    <ExamBookletView
      booklet={res.data}
      base={`${HOME}/${id}`}
      backLabel={res.data.campaign.title}
      answerKey={answerKey}
    />
  );
}
