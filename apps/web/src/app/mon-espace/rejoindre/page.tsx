import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { getSession } from '@/lib/session';
import { joinCohortAction, joinTeamAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rejoindre une classe ou une équipe' };

interface Props {
  searchParams: Promise<{ message?: string | string[]; erreur?: string | string[] }>;
}

export default async function JoinPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/rejoindre');
  const query = await searchParams;

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Rejoindre une classe ou une équipe</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      <form
        action={joinCohortAction}
        className="space-y-4 rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]"
      >
        <h2 className="text-xl font-bold">J’ai un code de classe</h2>
        <p>Ton enseignant t’a donné un code ? Écris-le ici pour entrer dans ta classe.</p>
        <label className="block font-bold">
          Code de classe
          <input
            name="code"
            className={`${inputClass} uppercase tracking-widest`}
            required
            minLength={4}
            maxLength={20}
            autoComplete="off"
          />
        </label>
        <button type="submit" className={buttonClass}>
          Rejoindre la classe
        </button>
      </form>
      <h2 className="text-xl font-bold">J’ai un code d’invitation d’équipe</h2>
      <p>
        La direction de votre établissement vous a remis un code ? Saisissez-le ici : vous recevez
        le rôle et les cycles prévus pour vous.
      </p>
      <form
        action={joinTeamAction}
        className="space-y-4 rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]"
      >
        <label className="block font-bold">
          Code d’invitation
          <input
            name="code"
            className={`${inputClass} uppercase tracking-widest`}
            required
            minLength={4}
            maxLength={20}
            autoComplete="off"
          />
        </label>
        <button type="submit" className={buttonClass}>
          Rejoindre l’équipe
        </button>
      </form>
    </section>
  );
}
