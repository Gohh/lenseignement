import { BRANCHES, TEAM_ROLE_LABELS, type TeamOverview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { inviteMemberAction, removeMemberAction, updateBranchesAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Équipe' };

interface Props {
  searchParams: Promise<{
    message?: string | string[];
    erreur?: string | string[];
    code?: string | string[];
  }>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

function Cycles({ checked }: { checked: string[] | null }) {
  return (
    <fieldset className="flex flex-wrap gap-x-5 gap-y-1">
      <legend className="font-bold">Cycles accordés (aucun coché : tous)</legend>
      {BRANCHES.map((b) => (
        <label key={b.code} className="flex min-h-[44px] items-center gap-2">
          <input
            type="checkbox"
            name="branch"
            value={b.code}
            defaultChecked={checked?.includes(b.code) ?? false}
            className="h-6 w-6 accent-primary"
          />
          {b.title}
        </label>
      ))}
    </fieldset>
  );
}

export default async function TeamPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/equipe');
  const query = await searchParams;
  const result = await apiGet<TeamOverview>(session.accessToken, '/team');
  const team = result.ok
    ? result.data
    : { organizations: [], members: [], grantable: [] as string[] };
  const code = param(query.code);

  if (team.organizations.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Équipe</h1>
        <p>Cette page est réservée à la direction et aux administrateurs d’un établissement.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Équipe</h1>
      <p>
        Invitez des collègues avec un code, choisissez leur rôle et les cycles où ils travaillent.
        Chacun ne voit que les cycles qui lui sont accordés.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {code && (
        <div className="rounded-big border-2 border-primary bg-primary-soft p-5" role="status">
          <h2 className="text-xl font-bold">Code d’invitation</h2>
          <p className="mt-2 text-4xl font-bold tracking-widest" data-testid="invitation-code">
            {code}
          </p>
          <p className="mt-2">
            Donnez ce code à la personne. Il est valable 7 jours et ne marche qu’une fois. Elle le
            saisit dans « Rejoindre une équipe », depuis Mon espace.
          </p>
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Membres</h2>
        <ul className="mt-3 space-y-4" role="list">
          {team.members.map((m) => (
            <li key={m.id} className="rounded-card border border-line p-4">
              <p className="text-lg font-bold">
                {m.userName ?? 'Sans nom'} : {TEAM_ROLE_LABELS[m.role] ?? m.role}
              </p>
              <p className="text-ink-muted">{m.organization.name}</p>
              <form action={updateBranchesAction} className="mt-2 space-y-2">
                <input type="hidden" name="memberId" value={m.id} />
                <Cycles checked={m.branches} />
                <button type="submit" className={secondaryButtonClass}>
                  Enregistrer les cycles
                </button>
              </form>
              <form action={removeMemberAction} className="mt-2">
                <input type="hidden" name="memberId" value={m.id} />
                <button type="submit" className={secondaryButtonClass}>
                  Retirer ce rôle
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>

      <form action={inviteMemberAction} className={`${cardClass} space-y-4`}>
        <h2 className="text-xl font-bold">Inviter quelqu’un</h2>
        <label className="block font-bold">
          Établissement
          <select name="organizationId" className={inputClass} required>
            {team.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-bold">
          Rôle
          <select name="role" className={inputClass} required>
            {team.grantable.map((role) => (
              <option key={role} value={role}>
                {TEAM_ROLE_LABELS[role] ?? role}
              </option>
            ))}
          </select>
        </label>
        <Cycles checked={null} />
        <button type="submit" className={buttonClass}>
          Créer un code d’invitation
        </button>
      </form>
    </section>
  );
}
