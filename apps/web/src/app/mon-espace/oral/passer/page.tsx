import type { OralSheet } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { OralRunner } from '@/components/OralRunner';
import { apiGet } from '@/lib/api';
import { ownerOf } from '@/lib/device-owner';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faire passer' };

const ID = /^[0-9a-f-]{36}$/i;

/** Passation dans une classe : la page garde l'épreuve et la liste, même sans connexion. */
export default async function OralRunPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams) ?? {};
  const test = param(query.epreuve) ?? '';
  const cohort = param(query.classe) ?? '';
  const here = `/mon-espace/oral/passer?epreuve=${test}&classe=${cohort}`;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(here)}`);
  if (!ID.test(test) || !ID.test(cohort)) redirect('/mon-espace/oral');
  const res = await apiGet<OralSheet>(
    session.accessToken,
    `/oral/sheet?test=${test}&cohort=${cohort}`,
  );

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <Link href="/mon-espace/oral" className="inline-flex min-h-[44px] items-center underline">
        ← Évaluations orales
      </Link>
      {!res.ok ? (
        <Notice error="Cette épreuve ou cette classe n’est pas disponible pour vous." />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold">{res.data.test.title}</h1>
              <p className="text-ink-muted">
                {res.data.cohort.name} · {res.data.cohort.school}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/mon-espace/oral/${test}/feuille`} className="min-h-[44px] underline">
                Feuille de l’élève
              </Link>
              <Link
                href={`/mon-espace/oral/resultats?epreuve=${test}&classe=${cohort}`}
                className="min-h-[44px] underline"
              >
                Résultats de la classe
              </Link>
            </div>
          </div>
          <OralRunner sheet={res.data} owner={ownerOf(session.subject)} />
        </>
      )}
    </section>
  );
}
