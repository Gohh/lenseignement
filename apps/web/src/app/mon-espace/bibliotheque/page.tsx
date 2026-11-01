import type { ResourceItem } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { Notice, param } from '@/components/Notice';
import { Library } from '@/components/library/Library';
import { apiGet, type CohortSummary } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bibliothèque' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LibraryPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/bibliotheque');
  const query = await searchParams;
  const [result, cohorts] = await Promise.all([
    apiGet<{ items: ResourceItem[] }>(session.accessToken, '/me/resources'),
    apiGet<CohortSummary[]>(session.accessToken, '/cohorts'),
  ]);
  const items = result.ok ? result.data.items : [];
  const teaching = (cohorts.ok ? cohorts.data : []).map((c) => ({
    id: c.id,
    label: `${c.name} · ${c.organization.name}`,
  }));

  return (
    <div className="space-y-4">
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />
      <Library items={items} cohorts={teaching} />
    </div>
  );
}
