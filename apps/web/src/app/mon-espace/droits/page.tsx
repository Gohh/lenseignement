import {
  RIGHT_DEFINITIONS,
  TEAM_ROLE_LABELS,
  type RightProfile,
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
const cell = 'px-2 py-3 align-top';

/** Titres courts des colonnes ; le libellé complet est rappelé sous le tableau. */
const SHORT: Record<string, string> = {
  etablissements: 'Établis\u00adsements',
  equipe: 'Équipe',
  comptes: 'Comptes',
  journal: 'Journal',
  'programmes-importer': 'Importer progr.',
  'programmes-publier': 'Publier progr.',
  consulter: 'Consulter',
  suivi: 'Suivi',
  statistiques: 'Statis\u00adtiques',
};

/** Nom du profil sans la parenthèse : « Chef d'établissement », « IEPP ». */
const profileName = (profile: string) =>
  profile === 'partenaire'
    ? 'Partenaire TF'
    : (TEAM_ROLE_LABELS[profile] ?? profile).replace(/ \(.*\)$/, '');

/** Profils rangés par étage, comme dans la liste des comptes. */
const PROFILE_LEVELS: Array<{ title: string; profiles: RightProfile[] }> = [
  {
    title: 'National',
    profiles: [
      'administrateur',
      'cabinet',
      'direction-centrale',
      'partenaire',
      'referent-pedagogique',
    ],
  },
  {
    title: 'Régional et local',
    profiles: ['gestionnaire', 'apfc', 'iepp', 'conseiller-pedagogique', 'conseiller-alpha'],
  },
  {
    title: 'Établissement',
    profiles: [
      'chef-etablissement',
      'censeur',
      'correspondant-fichier',
      'educateur',
      'conseiller-orientation',
    ],
  },
];

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
          Une ligne par profil, une colonne par droit. Chaque profil a ses droits par défaut.
          Décochez une case pour retirer un droit à toutes les personnes de ce profil, recochez-la
          pour le rendre. Un tiret signifie que ce profil n’a jamais ce droit. Vous gardez tous les
          droits.
        </p>
      </div>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      <form action={saveRightsAction} className="space-y-4">
        <div className={`${cardClass} p-0`}>
          <div className="overflow-x-auto" data-testid="droits">
            <table className="w-full min-w-[44rem] text-left">
              <thead className="bg-primary-soft text-sm text-ink-muted">
                <tr>
                  <th scope="col" className={`${cell} uppercase tracking-wide`}>
                    Profil
                  </th>
                  {RIGHT_DEFINITIONS.map((d) => (
                    <th
                      key={d.code}
                      scope="col"
                      title={d.description}
                      className={`${cell} text-center font-bold`}
                    >
                      {SHORT[d.code] ?? d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {PROFILE_LEVELS.map((level) => (
                <tbody key={level.title} className="divide-y divide-line border-t border-line">
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={RIGHT_DEFINITIONS.length + 1}
                      className={`${cell} bg-background text-sm uppercase tracking-wide text-ink-muted`}
                    >
                      {level.title}
                    </th>
                  </tr>
                  {level.profiles.map((profile) => (
                    <tr key={profile}>
                      <th scope="row" className={`${cell} w-40 font-bold`}>
                        {profileName(profile)}
                      </th>
                      {RIGHT_DEFINITIONS.map((d) => (
                        <td key={d.code} className={`${cell} text-center`}>
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
              ))}
            </table>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {RIGHT_DEFINITIONS.map((d) => (
            <div key={d.code}>
              <dt className="inline font-bold">{d.label} : </dt>
              <dd className="inline text-ink-muted">{d.description}</dd>
            </div>
          ))}
        </dl>
        <button type="submit" className={buttonClass}>
          Enregistrer les droits
        </button>
      </form>
    </section>
  );
}
