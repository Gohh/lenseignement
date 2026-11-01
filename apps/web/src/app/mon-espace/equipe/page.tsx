import { BRANCHES, TEAM_ROLE_LABELS, type TeamOverview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { CreateAccount } from './CreateAccount';
import { removeMemberAction, updateBranchesAction } from './actions';

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
    : {
        organizations: [],
        members: [],
        grantable: [] as string[],
        canCreateOrganization: false,
        everywhere: false,
        directions: [] as Array<{ id: string; name: string }>,
      };
  const accountStatus = await apiGet<{ configured: boolean }>(
    session.accessToken,
    '/team/accounts/status',
  );

  if (team.organizations.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Équipe</h1>
        {team.canCreateOrganization ? (
          <p>
            Aucun établissement pour le moment. Commencez par en{' '}
            <a href="/mon-espace/configuration">créer un</a>, puis invitez son équipe.
          </p>
        ) : (
          <p>Cette page est réservée à la direction, aux gestionnaires et aux administrateurs.</p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Équipe</h1>
        <Dialog label="+ Créer un compte" title="Créer un compte" primary>
          <CreateAccount
            organizations={team.organizations}
            grantable={team.grantable}
            configured={accountStatus.ok && accountStatus.data.configured}
          />
        </Dialog>
      </div>
      <p>
        Voici les membres de l’équipe. Pour inviter quelqu’un avec un code, ouvrez la page{' '}
        <a href="/mon-espace/invitations">Invitations</a>. Vous pouvez aussi créer son compte
        directement. Chacun ne voit que les cycles qui lui sont accordés.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

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
              {m.isSelf || m.role === 'superadministrateur' ? (
                <p className="mt-2 text-ink-muted">
                  {m.role === 'superadministrateur'
                    ? 'Ce rôle ne se retire pas ici.'
                    : 'Vous ne pouvez pas retirer votre propre rôle.'}
                </p>
              ) : (
                <form action={removeMemberAction} className="mt-2">
                  <input type="hidden" name="memberId" value={m.id} />
                  <button type="submit" className={secondaryButtonClass}>
                    Retirer ce rôle
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
