import { WORKSHOP_TRADES, WORKSHOP_TRADE_LABELS } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createWorkshopAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Créer un atelier' };

export default async function NewWorkshopPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/ateliers/nouveau');
  const query = (await searchParams) ?? {};
  const orgs = await apiGet<{ items: Array<{ id: string; name: string }> }>(
    session.accessToken,
    '/authoring/workshops/organizations',
  );
  const items = orgs.ok ? orgs.data.items : [];

  return (
    <section className="mx-auto max-w-prose space-y-6">
      <Link href="/mon-espace/ateliers" className="inline-flex min-h-[44px] items-center underline">
        ← Ateliers
      </Link>
      <h1 className="text-3xl font-extrabold">Créer un atelier</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {items.length === 0 ? (
        <p>Vous ne pouvez rédiger d’atelier pour aucune structure.</p>
      ) : (
        <form action={createWorkshopAction} className="space-y-4">
          <label className="block font-bold">
            Titre
            <input
              name="title"
              required
              maxLength={120}
              className={inputClass}
              placeholder="Exemple : changer une roue en sécurité"
            />
          </label>
          <label className="block font-bold">
            Métier
            <select name="trade" required className={inputClass}>
              {WORKSHOP_TRADES.map((t) => (
                <option key={t} value={t}>
                  {WORKSHOP_TRADE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-bold">
            Structure
            <select name="organizationId" required className={inputClass}>
              {items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClass}>
            Créer et ajouter les étapes
          </button>
        </form>
      )}
    </section>
  );
}
