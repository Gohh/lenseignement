import {
  JOIN_REQUEST_STATUS_LABELS,
  levelLabel,
  TEAM_ROLE_LABELS,
  type JoinRequestList,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
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
  const mine = await apiGet<JoinRequestList>(session.accessToken, '/team/requests/mine');
  const requests = mine.ok ? mine.data.items : [];

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Rejoindre une classe ou une équipe</h1>
      <Notice message={param(query.message)} error={param(query.erreur)} />
      {requests.length > 0 && (
        <div
          className="rounded-big border-2 border-primary bg-primary-soft p-5"
          data-testid="my-requests"
        >
          <h2 className="text-xl font-bold">Mes demandes pour rejoindre une équipe</h2>
          <ul className="mt-2 space-y-3" role="list">
            {requests.map((r) => (
              <li key={r.id}>
                <p className="font-bold">
                  {r.organization.name} : {TEAM_ROLE_LABELS[r.role] ?? r.role}
                </p>
                <p>{JOIN_REQUEST_STATUS_LABELS[r.status]}</p>
                <p className="text-ink-muted">
                  {r.levels.map((l) => levelLabel(l) ?? l).join(', ')} · {r.subjects.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
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
        La direction de votre établissement vous a remis un code ? Saisissez-le ici. Si vous
        enseignez, vous choisirez ensuite vos niveaux et vos matières, puis la direction validera.
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
