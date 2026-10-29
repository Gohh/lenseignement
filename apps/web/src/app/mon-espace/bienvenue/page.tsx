import { redirect } from 'next/navigation';
import { buttonClass, Notice, param } from '@/components/Notice';
import { apiGet, type Me } from '@/lib/api';
import { getSession } from '@/lib/session';
import { chooseProfilesAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bienvenue' };

interface Props {
  searchParams: Promise<{ erreur?: string | string[] }>;
}

const CHOICES = [
  {
    value: 'apprenant',
    title: 'Je suis apprenant',
    text: 'Je choisis mon cycle et mon niveau, puis j’apprends. En maternelle et en primaire, c’est un parent qui crée le profil de l’enfant.',
  },
  {
    value: 'parent',
    title: 'Je suis parent ou tuteur',
    text: 'J’ajoute mes enfants, je suis leurs progrès et je peux inviter un répétiteur.',
  },
  {
    value: 'repetiteur',
    title: 'Je suis répétiteur',
    text: 'Un parent m’a donné un code : je suis les enfants qui me sont confiés.',
  },
  {
    value: 'equipe',
    title: 'Je fais partie d’un établissement',
    text: 'Enseignant, direction, gestionnaire : j’ai reçu un code d’invitation de mon équipe.',
  },
] as const;

export default async function WelcomePage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/bienvenue');
  const query = await searchParams;
  const me = await apiGet<Me>(session.accessToken, '/me');
  const current = new Set(me.ok ? me.data.profiles : []);

  return (
    <section className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-extrabold">Bienvenue, {session.displayName}</h1>
        <p className="text-lg text-ink-muted">
          Qui es-tu sur la plateforme ? Tu peux cocher plusieurs choix (par exemple parent et
          répétiteur). Chaque choix ouvre son propre menu.
        </p>
      </div>
      <Notice error={param(query.erreur)} />
      <form action={chooseProfilesAction} className="space-y-6">
        <ul className="space-y-4" role="list">
          {CHOICES.map((choice) => (
            <li key={choice.value}>
              <label className="flex cursor-pointer items-start gap-4 rounded-big border-2 border-primary-line bg-surface p-5 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
                <input
                  type="checkbox"
                  name="profile"
                  value={choice.value}
                  defaultChecked={current.has(choice.value)}
                  className="mt-1 h-6 w-6 flex-none accent-primary"
                />
                <span className="space-y-1">
                  <span className="block text-xl font-extrabold">{choice.title}</span>
                  <span className="block text-ink-muted">{choice.text}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button type="submit" className={`${buttonClass} min-h-[56px] px-8 text-xl`}>
          Continuer
        </button>
      </form>
    </section>
  );
}
