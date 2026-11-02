import type { ExamBooklet } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { ExamBookletView } from '@/components/ExamBookletView';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Livret de l’épreuve' };

const HOME = '/mon-espace/epreuves';

/** Livret à imprimer pour les élèves, ou corrigé de l'enseignant (`?version=corrige`). */
export default async function ExamBookletPage({
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
  const key = ((await searchParams) ?? {}).version === 'corrige';
  const res = await apiGet<ExamBooklet>(session.accessToken, `/authoring/exams/${id}/booklet`);
  if (!res.ok) redirect(`${HOME}?erreur=${encodeURIComponent('Épreuve introuvable.')}`);
  return (
    <ExamBookletView
      booklet={res.data}
      base={`${HOME}/${id}`}
      backLabel={res.data.exam.title}
      answerKey={key}
    />
  );
}
