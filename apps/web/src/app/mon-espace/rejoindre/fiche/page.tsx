import { TEAM_ROLE_LABELS, type InvitationPreview } from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiSend } from '@/lib/api';
import { getSession } from '@/lib/session';
import { sendRequestAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes niveaux et mes matières' };

interface Props {
  searchParams: Promise<{ code?: string | string[]; erreur?: string | string[] }>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function RequestFormPage({ searchParams }: Props) {
  const query = await searchParams;
  const code = param(query.code) ?? '';
  const session = await getSession();
  if (!session) {
    redirect(
      `/auth/login?returnTo=${encodeURIComponent(`/mon-espace/rejoindre/fiche?code=${code}`)}`,
    );
  }
  const preview = await apiSend<InvitationPreview>(
    session.accessToken,
    'POST',
    '/team/invitations/preview',
    { code },
  );
  if (!preview.ok) {
    redirect(
      `/mon-espace/rejoindre?erreur=${encodeURIComponent(preview.message ?? 'Code invalide ou expiré.')}`,
    );
  }
  const p = preview.data;

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Mes niveaux et mes matières</h1>
      <p>
        Vous rejoignez <strong>{p.organization}</strong> comme{' '}
        <strong>{TEAM_ROLE_LABELS[p.role] ?? p.role}</strong>. Cochez les niveaux où vous enseignez
        et vos matières. La direction validera votre demande ; vous aurez alors accès à votre
        espace.
      </p>
      <Notice error={param(query.erreur)} />
      <form action={sendRequestAction} className={`${cardClass} space-y-6`}>
        <input type="hidden" name="code" value={code} />
        <fieldset className="space-y-1">
          <legend className="text-xl font-bold">Mes niveaux</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {p.levels.map((l) => (
              <label key={l.code} className="flex min-h-[44px] items-center gap-2">
                <input
                  type="checkbox"
                  name="level"
                  value={l.code}
                  className="h-6 w-6 accent-primary"
                />
                {l.title}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="text-xl font-bold">Mes matières</legend>
          {p.subjects.length > 0 ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {p.subjects.map((s) => (
                <label key={s} className="flex min-h-[44px] items-center gap-2">
                  <input
                    type="checkbox"
                    name="subject"
                    value={s}
                    className="h-6 w-6 accent-primary"
                  />
                  {s}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-ink-muted">
              Aucun programme n’est encore publié pour ces niveaux : écrivez vos matières
              ci-dessous.
            </p>
          )}
          <label className="block pt-2 font-bold">
            {p.subjects.length > 0 ? 'Autres matières' : 'Matières'} (séparées par des virgules)
            <input
              name="others"
              className={inputClass}
              placeholder="Par exemple : Français, Mathématiques"
              maxLength={600}
              autoComplete="off"
            />
          </label>
        </fieldset>
        <button type="submit" className={buttonClass}>
          Envoyer ma demande à la direction
        </button>
      </form>
    </section>
  );
}
