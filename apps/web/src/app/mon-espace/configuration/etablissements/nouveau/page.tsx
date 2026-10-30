import {
  ESTABLISHMENT_CATEGORIES,
  ESTABLISHMENT_CATEGORY_HINTS,
  ESTABLISHMENT_CATEGORY_LABELS,
  establishmentFields,
  templateHeader,
  type EstablishmentCategory,
  type TeamOverview,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { EstablishmentForm } from '../EstablishmentForm';
import { ImportEstablishments } from '../ImportEstablishments';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ajouter un établissement' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PATH = '/mon-espace/configuration/etablissements/nouveau';
const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const choiceClass =
  'block rounded-big border-2 border-line bg-surface p-5 no-underline hover:border-primary hover:bg-primary-soft focus-visible:border-primary';

/**
 * Ajout en trois temps : 1. le type d'établissement, 2. formulaire ou import, 3. la saisie. Le type
 * choisi fixe les champs, les informations obligatoires, le canevas et les contrôles du fichier.
 */
export default async function NewEstablishmentPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=${PATH}`);
  const query = await searchParams;
  const wanted = param(query.categorie) ?? '';
  const category = (ESTABLISHMENT_CATEGORIES as readonly string[]).includes(wanted)
    ? (wanted as EstablishmentCategory)
    : null;
  const mode = category ? param(query.mode) : undefined;
  const overview = await apiGet<TeamOverview>(session.accessToken, '/team');
  const team = overview.ok ? overview.data : null;

  const steps = ['Type d’établissement', 'Formulaire ou import', 'Saisie et contrôles'];
  const step = !category ? 0 : mode === 'formulaire' || mode === 'import' ? 2 : 1;

  return (
    <section className="space-y-6">
      <a
        href="/mon-espace/configuration"
        className="inline-flex min-h-[44px] items-center font-bold"
      >
        ← Établissements
      </a>
      <h1 className="text-3xl font-extrabold">Ajouter un établissement</h1>
      {!team?.canCreateOrganization ? (
        <p>Vous n’avez pas le droit d’ajouter un établissement.</p>
      ) : team.directions.length === 0 ? (
        <div className={`${cardClass} space-y-4`} data-testid="needs-direction">
          <p>
            Un établissement se rattache toujours à une direction régionale (DRENA). Il n’en existe
            encore aucune : créez-la d’abord.
          </p>
          {team.everywhere && (
            <a href="/mon-espace/configuration?vue=drena&ouvrir=drena" className={buttonClass}>
              + Créer une direction régionale
            </a>
          )}
        </div>
      ) : (
        <>
          <ol className="flex flex-wrap gap-2" aria-label="Étapes">
            {steps.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? 'step' : undefined}
                className={`rounded-card border px-4 py-2 font-bold ${
                  i === step
                    ? 'border-primary bg-primary-soft text-primary'
                    : i < step
                      ? 'border-line text-ink'
                      : 'border-line text-ink-muted'
                }`}
              >
                {i < step ? '✓ ' : `${i + 1}. `}
                {s}
              </li>
            ))}
          </ol>

          {!category && (
            <div className="space-y-3">
              <h2 className="text-xl font-extrabold">Quel type d’établissement ?</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
                {ESTABLISHMENT_CATEGORIES.map((c) => (
                  <li key={c}>
                    <a href={`${PATH}?categorie=${c}`} className={choiceClass}>
                      <span className="block text-lg font-extrabold text-ink">
                        {ESTABLISHMENT_CATEGORY_LABELS[c]}
                      </span>
                      <span className="block text-ink-muted">
                        {ESTABLISHMENT_CATEGORY_HINTS[c]}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {category && (
            <p className="flex flex-wrap items-center gap-3">
              Type choisi :{' '}
              <strong className="text-lg" data-testid="chosen-category">
                {ESTABLISHMENT_CATEGORY_LABELS[category]}
              </strong>
              <a href={PATH} className="inline-flex min-h-[44px] items-center font-bold underline">
                Changer de type
              </a>
            </p>
          )}

          {category && step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-extrabold">Comment voulez-vous l’ajouter ?</h2>
              <ul className="grid gap-4 sm:grid-cols-2" role="list">
                <li>
                  <a href={`${PATH}?categorie=${category}&mode=formulaire`} className={choiceClass}>
                    <span className="block text-lg font-extrabold text-ink">
                      Remplir un formulaire
                    </span>
                    <span className="block text-ink-muted">Un établissement à la fois.</span>
                  </a>
                </li>
                <li>
                  <a href={`${PATH}?categorie=${category}&mode=import`} className={choiceClass}>
                    <span className="block text-lg font-extrabold text-ink">
                      Importer un fichier
                    </span>
                    <span className="block text-ink-muted">
                      Plusieurs d’un coup, à partir du canevas modèle de ce type.
                    </span>
                  </a>
                </li>
              </ul>
              <RequiredList category={category} />
            </div>
          )}

          {category && mode === 'formulaire' && (
            <div className={cardClass}>
              <EstablishmentForm
                category={category}
                directions={team.directions}
                defaults={
                  team.directions.length === 1 ? { parentId: team.directions[0]!.id } : undefined
                }
              />
            </div>
          )}

          {category && mode === 'import' && (
            <div className={`${cardClass} space-y-5`}>
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold">1. Télécharger le canevas</h2>
                <p>
                  Le canevas contient les colonnes de ce type, dans l’ordre, et une ligne d’exemple
                  à remplacer. Gardez les en-têtes ; une colonne marquée d’un astérisque est
                  obligatoire.
                </p>
                <a
                  href={`/mon-espace/configuration/etablissements/modele/${category}`}
                  download
                  className={buttonClass}
                >
                  Télécharger le canevas « {ESTABLISHMENT_CATEGORY_LABELS[category]} »
                </a>
                <Columns category={category} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-extrabold">2. Contrôler puis enregistrer</h2>
                <p>
                  Le fichier est contrôlé en entier : colonnes, informations obligatoires, valeurs,
                  doublons dans le fichier et avec ce qui est déjà enregistré. Rien n’est enregistré
                  tant qu’il reste une anomalie.
                </p>
                <ImportEstablishments category={category} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Informations obligatoires du type choisi, visibles avant de choisir formulaire ou import. */
function RequiredList({ category }: { category: EstablishmentCategory }) {
  const fields = establishmentFields(category);
  return (
    <div className={cardClass} data-testid="required-fields">
      <h3 className="font-extrabold">
        Informations demandées pour : {ESTABLISHMENT_CATEGORY_LABELS[category]}
      </h3>
      <p className="mt-2">
        <strong>Obligatoires :</strong>{' '}
        {fields
          .filter((f) => f.required)
          .map((f) => f.label)
          .join(', ')}
        .
      </p>
      <p className="mt-1">
        <strong>Facultatives :</strong>{' '}
        {fields
          .filter((f) => !f.required)
          .map((f) => f.label)
          .join(', ')}
        .
      </p>
    </div>
  );
}

/** Les colonnes du canevas et ce qu'elles attendent. */
function Columns({ category }: { category: EstablishmentCategory }) {
  return (
    <details className="rounded-card border border-line p-4">
      <summary className="min-h-[44px] cursor-pointer font-bold">
        Voir les colonnes du canevas et ce qu’elles attendent
      </summary>
      <ul className="mt-2 space-y-1">
        {establishmentFields(category).map((f) => (
          <li key={f.key}>
            <strong>{templateHeader(f)}</strong>
            {f.options ? ` : ${f.options.map((o) => o.label).join(', ')}` : ''}
            {f.hint ? ` · ${f.hint}` : ''}
          </li>
        ))}
      </ul>
    </details>
  );
}
