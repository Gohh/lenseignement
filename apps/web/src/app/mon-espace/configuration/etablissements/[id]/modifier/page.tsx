import {
  ESTABLISHMENT_CATEGORY_LABELS,
  type OrganizationDetail,
  type TeamOverview,
} from '@lenseignement/types';
import { notFound, redirect } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { EstablishmentForm } from '../../EstablishmentForm';
import { asCategory, defaultsOf } from '../../fiche';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modifier la fiche' };

interface Props {
  params: Promise<{ id: string }>;
}

/** « Modifier » : corriger une erreur de saisie. Rien n'entre dans l'historique. */
export default async function EditEstablishmentPage({ params }: Props) {
  const { id } = await params;
  const path = `/mon-espace/configuration/etablissements/${id}`;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${path}/modifier`);
  const [result, overview] = await Promise.all([
    apiGet<OrganizationDetail>(session.accessToken, `/organizations/${id}`),
    apiGet<TeamOverview>(session.accessToken, '/team'),
  ]);
  if (!result.ok) notFound();
  const o = result.data;
  const category = asCategory(o.type);
  if (!category || !o.can.edit) redirect(path);
  // La DRENA actuelle reste proposée même si elle n'est pas dans la liste de la personne.
  const directions = overview.ok ? [...overview.data.directions] : [];
  if (o.direction && !directions.some((d) => d.id === o.direction!.id)) {
    directions.push(o.direction);
  }

  return (
    <section className="space-y-6">
      <a href={path} className="inline-flex min-h-[44px] items-center font-bold">
        ← Fiche de {o.name}
      </a>
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">{ESTABLISHMENT_CATEGORY_LABELS[category]}</p>
        <h1 className="text-3xl font-extrabold">Modifier la fiche</h1>
        <p className="text-ink-muted">
          Pour corriger une erreur de saisie : la fiche est remplacée, sans historique. Pour un vrai
          changement (nouveau responsable, nouvelle filière…), utilisez plutôt « Mettre à jour » sur
          la fiche.
        </p>
      </div>
      <div className="rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]">
        <EstablishmentForm
          id={o.id}
          category={category}
          directions={directions}
          defaults={defaultsOf(o, category)}
          canChangeStructure={o.can.editStructure}
        />
      </div>
    </section>
  );
}
