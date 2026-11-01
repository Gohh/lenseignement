import { TEAM_ROLE_LABELS, type InvitationList } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { createInvitationAction, revokeInvitationAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitations' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));

export default async function InvitationsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/invitations');
  const query = await searchParams;
  const result = await apiGet<InvitationList>(session.accessToken, '/team/invitations');
  const data = result.ok ? result.data : { organizations: [], grantable: [], items: [] };
  const code = param(query.code);

  if (data.organizations.length === 0 || data.grantable.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Invitations</h1>
        <p>Cette page est réservée à la direction, aux gestionnaires et aux administrateurs.</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Invitations</h1>
      <p>
        Créez ici le code d’une personne de l’équipe. Elle le saisit dans « Rejoindre une équipe »,
        depuis Mon espace. Les membres déjà dans l’équipe se gèrent dans{' '}
        <a href="/mon-espace/equipe">Équipe</a>.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {code && (
        <div className="rounded-big border-2 border-primary bg-primary-soft p-5" role="status">
          <h2 className="text-xl font-bold">Code d’invitation</h2>
          <p className="mt-2 text-4xl font-bold tracking-widest" data-testid="invitation-code">
            {code}
          </p>
          <p className="mt-2">
            Donnez ce code aux personnes concernées. Elles le saisissent dans « Rejoindre une équipe
            », depuis Mon espace. Un code d’enseignant ou d’alphabétiseur sert à autant de personnes
            que nécessaire : chacune choisit ses niveaux et matières, puis vous validez sa demande
            dans Équipe. Les autres rôles : une seule personne par code.
          </p>
        </div>
      )}

      <form action={createInvitationAction} className={`${cardClass} space-y-4`}>
        <h2 className="text-xl font-bold">Nouvelle invitation</h2>
        <label className="block font-bold">
          Établissement
          <select name="organizationId" className={inputClass} required>
            {data.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-bold">
          Rôle
          <select name="role" className={inputClass} required>
            {data.grantable.map((role) => (
              <option key={role} value={role}>
                {TEAM_ROLE_LABELS[role] ?? role}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-bold">
          Valable pendant (jours)
          <input
            name="days"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            className={inputClass}
          />
        </label>
        <button type="submit" className={buttonClass}>
          Créer le code d’invitation
        </button>
      </form>

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Invitations en attente</h2>
        <p className="mt-1 text-ink-muted">
          Codes pas encore utilisés. Dès qu’une personne a saisi son code, il disparaît d’ici et
          elle apparaît dans <a href="/mon-espace/equipe">Équipe</a>. Un code expiré ou révoqué
          disparaît aussi. Un code d’enseignant reste tant qu’il est valable : il sert à plusieurs
          personnes.
        </p>
        {data.items.length === 0 ? (
          <p className="mt-3">Aucune invitation en attente.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table
              className="w-full min-w-[44rem] border-collapse text-left"
              data-testid="invitations"
            >
              <thead>
                <tr className="border-b border-line">
                  <th className="p-2">Rôle</th>
                  <th className="p-2">Établissement</th>
                  <th className="p-2">Code</th>
                  <th className="p-2">Créée le</th>
                  <th className="p-2">Expire le</th>
                  <th className="p-2">Déjà utilisé</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className="border-b border-line align-top">
                    <td className="p-2">{TEAM_ROLE_LABELS[i.role] ?? i.role}</td>
                    <td className="p-2">{i.organization.name}</td>
                    <td className="p-2 font-mono font-bold tracking-wider">{i.code}</td>
                    <td className="p-2">{formatDate(i.createdAt)}</td>
                    <td className="p-2">{formatDate(i.expiresAt)}</td>
                    <td className="p-2">
                      {i.maxUses === null
                        ? `${i.uses} personne${i.uses > 1 ? 's' : ''} (sans limite)`
                        : 'Pas encore'}
                    </td>
                    <td className="p-2">
                      <form action={revokeInvitationAction.bind(null, i.id)}>
                        <button type="submit" className={secondaryButtonClass}>
                          Révoquer
                          <span className="sr-only"> le code {i.code}</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
