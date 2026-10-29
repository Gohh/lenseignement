import { levelLabel } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { LevelPicker } from '@/components/LevelPicker';
import { buttonClass, Notice, param } from '@/components/Notice';
import { apiGet, type Me } from '@/lib/api';
import { getSession } from '@/lib/session';
import { setLevelAction } from './actions';

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
    </section>
  );
}
