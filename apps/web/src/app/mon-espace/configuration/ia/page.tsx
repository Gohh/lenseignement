import {
  AI_DEFAULT_MODELS,
  AI_DEFAULT_URLS,
  AI_MAX_DAILY,
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  type AiSettingsView,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { saveAiSettingsAction, testAiAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Intelligence artificielle' };

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

const PROVIDER_HINTS: Record<(typeof AI_PROVIDERS)[number], string> = {
  mistral: 'Payant à l’usage, peu cher. Serveurs en Europe.',
  anthropic: 'Payant à l’usage. Très bon en français et pour suivre le format.',
  openai: 'Payant à l’usage.',
  local: 'Gratuit, installé sur votre serveur (16 Go de mémoire conseillés). Plus lent.',
};

/** Encart « IA » : le superadministrateur branche (ou débranche) l'aide à la rédaction. */
export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/configuration/ia');
  const query = await searchParams;
  const result = await apiGet<AiSettingsView>(session.accessToken, '/admin/ai');
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Intelligence artificielle</h1>
        <p>Cette page est réservée au superadministrateur.</p>
      </section>
    );
  }
  const s = result.data;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold">Intelligence artificielle</h1>
        <p>
          L’IA aide les enseignants à <strong>proposer</strong> des exercices dans la Fabrique. Elle
          ne reçoit que la compétence choisie et les précisions de l’enseignant :{' '}
          <strong>jamais le nom, les notes ou les réponses d’un élève</strong>. Tout ce qu’elle
          propose arrive en brouillon, puis passe par la relecture.
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <div
        className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}
        data-testid="ai-state"
      >
        <p className="text-lg font-bold">
          {s.enabled ? '● IA allumée' : '○ IA éteinte'}
          {s.enabled && ` · ${AI_PROVIDER_LABELS[s.provider]}`}
        </p>
        <p className="text-ink-muted">
          Aujourd’hui : {s.usedToday} demande{s.usedToday > 1 ? 's' : ''} sur {s.dailyLimit}
        </p>
      </div>

      <details className={cardClass}>
        <summary className="cursor-pointer font-display text-xl font-bold">
          Mémo : brancher l’IA pas à pas
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-6">
          <li>
            Choisissez un fournisseur ci-dessous. Pour commencer, Mistral est simple et peu cher.
          </li>
          <li>
            Créez un compte sur son site, ajoutez un petit crédit, puis créez une{' '}
            <strong>clé d’API</strong> (une longue suite de lettres). Copiez-la.
          </li>
          <li>
            Collez la clé dans « Clé du fournisseur », cochez « Allumer l’IA », puis Enregistrer.
          </li>
          <li>
            Cliquez sur « Essayer la connexion » : le message « Connexion réussie » confirme que
            tout marche.
          </li>
          <li>
            Modèle libre (gratuit) : installez Ollama sur le serveur, téléchargez un modèle, puis
            donnez l’adresse du serveur (par exemple {AI_DEFAULT_URLS.local}). Pas de clé.
          </li>
          <li>
            Pour tout arrêter : décochez « Allumer l’IA » et enregistrez. Le bouton disparaît
            aussitôt dans la Fabrique.
          </li>
        </ol>
        <p className="mt-3 text-sm text-ink-muted">
          La clé est gardée chiffrée et ne s’affiche plus jamais : seuls ses 4 derniers caractères
          restent visibles. La limite par jour évite une facture surprise.
        </p>
      </details>

      <form action={saveAiSettingsAction} className={`${cardClass} space-y-5`}>
        <label className="flex min-h-[44px] items-center gap-3 text-lg font-bold">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-6 w-6" />
          Allumer l’IA
        </label>

        <fieldset className="space-y-2">
          <legend className="font-bold">Fournisseur</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {AI_PROVIDERS.map((p) => (
              <label
                key={p}
                className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-card border border-line-strong p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  defaultChecked={s.provider === p}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <span className="block font-bold">{AI_PROVIDER_LABELS[p]}</span>
                  <span className="block text-sm text-ink-muted">{PROVIDER_HINTS[p]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block font-bold">
          Clé du fournisseur
          <input
            type="password"
            name="apiKey"
            autoComplete="off"
            className={inputClass}
            placeholder={s.hasKey ? `Clé enregistrée ••••${s.keyHint ?? ''}` : 'Collez la clé ici'}
          />
          <span className="mt-1 block text-sm font-normal text-ink-muted">
            {s.hasKey
              ? 'Laissez vide pour garder la clé enregistrée.'
              : 'Pas de clé pour un modèle libre sur votre serveur.'}
          </span>
        </label>
        {s.hasKey && (
          <label className="flex min-h-[44px] items-center gap-3">
            <input type="checkbox" name="removeKey" className="h-5 w-5" />
            Effacer la clé enregistrée
          </label>
        )}

        <details>
          <summary className="cursor-pointer font-bold">Réglages avancés</summary>
          <div className="mt-3 space-y-4">
            <label className="block font-bold">
              Modèle
              <input
                name="model"
                defaultValue={s.model}
                maxLength={80}
                className={inputClass}
                placeholder="Vide : le modèle conseillé"
              />
              <span className="mt-1 block text-sm font-normal text-ink-muted">
                Conseillés :{' '}
                {AI_PROVIDERS.map(
                  (p) => `${AI_PROVIDER_LABELS[p].split(' (')[0]} ${AI_DEFAULT_MODELS[p]}`,
                ).join(' · ')}
              </span>
            </label>
            <label className="block font-bold">
              Adresse du serveur
              <input
                name="baseUrl"
                defaultValue={s.baseUrl}
                maxLength={300}
                className={inputClass}
                placeholder={AI_DEFAULT_URLS.local}
              />
              <span className="mt-1 block text-sm font-normal text-ink-muted">
                Obligatoire pour un modèle libre. Vide pour les autres fournisseurs.
              </span>
            </label>
          </div>
        </details>

        <label className="block font-bold">
          Demandes par jour (toute la plateforme)
          <input
            type="number"
            name="dailyLimit"
            min={1}
            max={AI_MAX_DAILY}
            defaultValue={s.dailyLimit}
            className={`${inputClass} max-w-[10rem]`}
          />
        </label>

        <button type="submit" className={buttonClass}>
          Enregistrer
        </button>
      </form>

      <form action={testAiAction}>
        <button type="submit" className={secondaryButtonClass}>
          Essayer la connexion
        </button>
      </form>
    </section>
  );
}
