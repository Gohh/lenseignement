import {
  RIGHT_DEFINITIONS,
  RIGHT_PROFILES,
  TEAM_ROLE_LABELS,
  type RightsOverview,
} from '@lenseignement/types';
import { redirect } from 'next/navigation';
import { buttonClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { saveRightsAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Droits' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const cell = 'px-4 py-3 align-top';

export default async function RightsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/droits');
  const query = await searchParams;
  const result = await apiGet<RightsOverview>(session.accessToken, '/admin/rights');
  if (!result.ok) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Droits</h1>
        <p>Cette page est réservée au superadministrateur.</p>
      </section>
    );
  }
  const withdrawn = new Set(result.data.withdrawn.map((w) => `${w.profile} ${w.right}`));

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="font-bold text-ink-muted">Comptes et droits / Droits</p>
        <h1 className="text-4xl font-extrabold">Droits</h1>
        <p className="text-ink-muted">
          Chaque profil a ses droits par défaut. Décochez une case pour retirer un droit à toutes
          les personnes de ce profil, recochez-la pour le rendre. Un tiret signifie que ce profil
          n’a jamais ce droit. Vous gardez tous les droits.
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <form action={saveRightsAction} className="space-y-4">
        <div className={`${cardClass} p-0`}>
          <div className="overflow-x-auto" data-testid="droits">
            <table className="w-full min-w-[44rem] text-left">
              <thead className="bg-primary-soft text-sm uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className={cell}>
                    Droit
                  </th>
                  {RIGHT_PROFILES.map((profile) => (
                    <th key={profile} scope="col" className={`${cell} text-center`}>
                      {TEAM_ROLE_LABELS[profile]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {RIGHT_DEFINITIONS.map((d) => (
                  <tr key={d.code}>
                    <th scope="row" className={`${cell} font-normal`}>
                      <span className="font-bold">{d.label}</span>
                      <span className="block text-sm text-ink-muted">{d.description}</span>
                    </th>
                    {RIGHT_PROFILES.map((profile) => (
                      <td key={profile} className={`${cell} text-center`}>
                        {d.profiles.includes(profile) ? (
                          <input
                            type="checkbox"
                            name="garde"
                            value={`${profile} ${d.code}`}
                            defaultChecked={!withdrawn.has(`${profile} ${d.code}`)}
                            aria-label={`${d.label} : ${TEAM_ROLE_LABELS[profile]}`}
                            className="h-6 w-6 accent-primary"
                          />
                        ) : (
                          <span aria-label="Sans objet">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button type="submit" className={buttonClass}>
          Enregistrer les droits
        </button>
      </form>
    </section>
  );
}
