import {
  BRANCHES,
  levelLabel,
  roleTitle,
  TEAM_ROLE_LABELS,
  type JoinRequestList,
  type TeamOverview,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { ImportAccounts } from '../comptes/ImportAccounts';
import { CreateAccount } from './CreateAccount';
import {
  approveRequestAction,
  refuseRequestAction,
  removeMemberAction,
  updateBranchesAction,
} from './actions';

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
  const pending = await apiGet<JoinRequestList>(session.accessToken, '/team/requests');
  const requests = pending.ok ? pending.data.items : [];
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
        {team.grantable.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Dialog label="Importer des comptes" title="Importer des comptes">
              <ImportAccounts configured={accountStatus.ok && accountStatus.data.configured} />
            </Dialog>
            <Dialog label="+ Créer un compte" title="Créer un compte" primary>
              <CreateAccount
                organizations={team.organizations}
                grantable={team.grantable}
                configured={accountStatus.ok && accountStatus.data.configured}
              />
            </Dialog>
          </div>
        )}
      </div>
      <p>
        Voici les membres de l’équipe. Pour inviter quelqu’un avec un code, ouvrez la page{' '}
        <a href="/mon-espace/invitations">Invitations</a>. Vous pouvez aussi créer son compte
        directement. Chacun ne voit que les cycles qui lui sont accordés.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {requests.length > 0 && (
        <div className={`${cardClass} border-2 border-primary`} data-testid="join-requests">
          <h2 className="text-xl font-bold">Demandes à valider ({requests.length})</h2>
          <p className="mt-1">
            Ces personnes ont saisi un code d’invitation. Vérifiez leurs niveaux et matières,
            corrigez-les au besoin, puis validez ou refusez.
          </p>
          <ul className="mt-3 space-y-4" role="list">
            {requests.map((r) => (
              <li key={r.id} className="rounded-card border border-line p-4">
                <p className="text-lg font-bold">
                  {r.userName ?? 'Sans nom'} : {TEAM_ROLE_LABELS[r.role] ?? r.role}
                </p>
                <p className="text-ink-muted">
                  {r.organization.name} · reçue le{' '}
                  {new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'medium',
                    timeZone: 'UTC',
                  }).format(new Date(r.createdAt))}
                </p>
                <form action={approveRequestAction.bind(null, r.id)} className="mt-2 space-y-3">
                  <fieldset className="flex flex-wrap gap-x-5 gap-y-1">
                    <legend className="font-bold">Niveaux</legend>
                    {r.levelOptions.map((l) => (
                      <label key={l.code} className="flex min-h-[44px] items-center gap-2">
                        <input
                          type="checkbox"
                          name="level"
                          value={l.code}
                          defaultChecked={r.levels.includes(l.code)}
                          className="h-6 w-6 accent-primary"
                        />
                        {l.title}
                      </label>
                    ))}
                  </fieldset>
                  <label className="block font-bold">
                    Matières (séparées par des virgules)
                    <input
                      name="subjects"
                      defaultValue={r.subjects.join(', ')}
                      className={inputClass}
                      maxLength={600}
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" className={buttonClass}>
                      Valider<span className="sr-only"> la demande de {r.userName}</span>
                    </button>
                    <button
                      type="submit"
                      formAction={refuseRequestAction.bind(null, r.id)}
                      className={secondaryButtonClass}
                    >
                      Refuser<span className="sr-only"> la demande de {r.userName}</span>
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Membres</h2>
        <ul className="mt-3 divide-y divide-line" role="list" data-testid="team-members">
          {team.members.map((m) => {
            const name = m.userName ?? 'Sans nom';
            const cycles =
              m.branches && m.branches.length > 0
                ? m.branches.map((c) => BRANCHES.find((b) => b.code === c)?.title ?? c).join(', ')
                : 'Tous les cycles';
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-bold">
                    {name}
                    <span className="font-normal text-ink-muted">
                      {' '}
                      · {roleTitle(m.role, m.organization.type)}
                    </span>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {m.organization.name} · {cycles}
                  </p>
                  {m.levels && (
                    <p className="text-sm" data-testid="member-levels">
                      Niveaux : {m.levels.map((l) => levelLabel(l) ?? l).join(', ')}
                      {m.subjects &&
                        m.subjects.length > 0 &&
                        ` · Matières : ${m.subjects.join(', ')}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Dialog
                    label={`Cycles de ${name}`}
                    icon="cycles"
                    tip="Cycles accordés"
                    title={`Cycles accordés : ${name}`}
                  >
                    <form action={updateBranchesAction} className="space-y-4">
                      <input type="hidden" name="memberId" value={m.id} />
                      <Cycles checked={m.branches} />
                      <button type="submit" className={buttonClass}>
                        Enregistrer les cycles
                      </button>
                    </form>
                  </Dialog>
                  {!m.isSelf && m.role !== 'superadministrateur' && (
                    <Dialog
                      label={`Retirer le rôle de ${name}`}
                      icon="retirerRole"
                      tip="Retirer ce rôle (avec confirmation)"
                      title={`Retirer le rôle de ${name} ?`}
                    >
                      <form action={removeMemberAction} className="space-y-4">
                        <input type="hidden" name="memberId" value={m.id} />
                        <p>
                          {name} ne sera plus « {roleTitle(m.role, m.organization.type)} » à{' '}
                          {m.organization.name}. Son compte reste actif.
                        </p>
                        <button type="submit" className={buttonClass}>
                          Oui, retirer ce rôle
                        </button>
                      </form>
                    </Dialog>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
