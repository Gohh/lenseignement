import { levelLabel, type LevelPromotion } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { DeviceDataPanel } from '@/components/DeviceDataPanel';
import { LevelPicker } from '@/components/LevelPicker';
import { buttonClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet, type Me } from '@/lib/api';
import { getSession } from '@/lib/session';
import { requestPromotionAction, setLevelAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon compte' };

interface Props {
  searchParams: Promise<{
    message?: string | string[];
    erreur?: string | string[];
    next?: string;
    bienvenue?: string;
  }>;
}

export default async function AccountPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/compte');
  const query = await searchParams;
  const me = await apiGet<Me>(session.accessToken, '/me');
  const level = me.ok ? me.data.level : null;
  const promotion = level
    ? await apiGet<LevelPromotion>(session.accessToken, '/me/promotion')
    : null;
  const promo = promotion?.ok ? promotion.data : null;

  return (
    <section className="space-y-6">
      <h1 className="text-4xl font-extrabold">
        {query.bienvenue ? `Bienvenue, ${session.displayName}` : 'Mon compte'}
      </h1>
      {query.bienvenue && (
        <p className="text-lg text-ink-muted">
          Dis-nous ton cycle et ton niveau : nous te montrerons les cours qui te conviennent.
        </p>
      )}
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <div className="rounded-big border border-line bg-surface p-5">
        <h2 className="text-xl font-extrabold">Mon nom</h2>
        <p className="mt-2 text-lg">{session.displayName}</p>
        <a
          href="/mon-espace/bienvenue"
          className="mt-2 inline-flex min-h-[44px] items-center font-bold underline"
        >
          Changer mes profils (apprenant, parent, répétiteur)
        </a>
      </div>
      <form
        action={setLevelAction}
        className="space-y-4 rounded-big border border-line bg-surface p-5"
      >
        <h2 className="text-xl font-extrabold">Mon cycle et mon niveau</h2>
        <p className="text-ink-muted">
          {level ? `Niveau actuel : ${levelLabel(level) ?? level}.` : 'Tu n’as pas encore choisi.'}{' '}
          Les cours proposés s’adaptent à ton niveau.
        </p>
        {query.next && <input type="hidden" name="next" value={query.next} />}
        <LevelPicker current={level} />
        <button type="submit" className={buttonClass}>
          Enregistrer
        </button>
      </form>
      {promo && (promo.nextLevel || promo.pending) && (
        <div className="space-y-3 rounded-big border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold">Niveau supérieur</h2>
          {promo.pending ? (
            <p data-testid="promotion-pending">
              Ta demande est envoyée. Ton parent ou ton enseignant doit la valider.
            </p>
          ) : (
            <>
              <p className="text-ink-muted">
                Tu as terminé ton niveau ? Demande à passer en{' '}
                <strong>{levelLabel(promo.nextLevel!) ?? promo.nextLevel}</strong>.
              </p>
              <form action={requestPromotionAction}>
                <button type="submit" className={secondaryButtonClass}>
                  Demander le niveau supérieur
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <div className="rounded-big border border-line bg-surface p-5">
        <h2 className="text-xl font-extrabold">Rejoindre une équipe</h2>
        <p className="mt-2 text-ink-muted">Tu as reçu un code d’invitation d’un établissement ?</p>
        <a
          href="/mon-espace/rejoindre"
          className="inline-flex min-h-[44px] items-center font-bold underline"
        >
          Saisir mon code
        </a>
      </div>

      <div className="rounded-big border border-line bg-surface p-5">
        <h2 className="text-xl font-extrabold">Cet appareil</h2>
        <DeviceDataPanel />
      </div>
    </section>
  );
}
