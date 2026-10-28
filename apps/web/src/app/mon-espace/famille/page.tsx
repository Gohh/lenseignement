import { LEVEL_GROUPS, levelLabel, type FamilyChild } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param, secondaryButtonClass } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { addChildAction, inviteTutorAction, revokeTutorAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma famille' };

interface Props {
  searchParams: Promise<{
    message?: string | string[];
    erreur?: string | string[];
    code?: string | string[];
  }>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';

export default async function FamilyPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/famille');
  const query = await searchParams;
  const children = await apiGet<{ items: FamilyChild[] }>(session.accessToken, '/family/children');
  const items = children.ok ? children.data.items : [];
  const code = param(query.code);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Ma famille</h1>
      <p>
        Vous créez le profil de vos enfants et vous gardez la main : votre enfant n’a pas de mot de
        passe, vous suivez ses progrès d’ici.
      </p>
      <Notice message={param(query.message)} error={param(query.erreur)} />

      {code && (
        <div className="rounded-big border-2 border-primary bg-primary-soft p-5" role="status">
          <h2 className="text-xl font-bold">Code pour le répétiteur</h2>
          <p className="mt-2 text-4xl font-bold tracking-widest" data-testid="invitation-code">
            {code}
          </p>
          <p className="mt-2">
            Donnez ce code au répétiteur. Il est valable 7 jours et ne marche qu’une fois. Le
            répétiteur le saisit dans « Répétiteur » après s’être connecté.
          </p>
        </div>
      )}

      <div className={cardClass}>
        <h2 className="text-xl font-bold">Mes enfants</h2>
        {items.length === 0 ? (
          <p className="mt-2">Vous n’avez pas encore ajouté d’enfant.</p>
        ) : (
          <ul className="mt-3 space-y-4" role="list">
            {items.map((child) => (
              <li key={child.id} className="rounded-card border border-line p-4">
                <p className="text-lg font-bold">{child.displayName}</p>
                <p className="text-ink-muted">
                  {child.level ? (levelLabel(child.level) ?? child.level) : 'Niveau non précisé'}
                </p>
                <p className="mt-2">
                  <Link href={`/mon-espace/eleves/${child.id}`} className="font-bold underline">
                    Voir ses progrès
                  </Link>
                </p>
                {child.tutors.length > 0 && (
                  <ul
                    className="mt-3 space-y-2"
                    role="list"
                    aria-label={`Répétiteurs de ${child.displayName}`}
                  >
                    {child.tutors.map((t) => (
                      <li key={t.linkId} className="flex flex-wrap items-center gap-3">
                        <span>Répétiteur : {t.tutorName ?? 'sans nom'}</span>
                        <form action={revokeTutorAction}>
                          <input type="hidden" name="linkId" value={t.linkId} />
                          <button type="submit" className={secondaryButtonClass}>
                            Retirer l’accès
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form action={addChildAction} className={`${cardClass} space-y-4`}>
        <h2 className="text-xl font-bold">Ajouter un enfant</h2>
        <label className="block font-bold">
          Prénom de l’enfant
          <input name="displayName" className={inputClass} required minLength={2} maxLength={60} />
        </label>
        <label className="block font-bold">
          Niveau ou classe (facultatif)
          <select name="level" className={inputClass} defaultValue="">
            <option value="">Je ne sais pas encore</option>
            {LEVEL_GROUPS.map((group) => (
              <optgroup key={group.code} label={group.title}>
                {group.levels.map((level) => (
                  <option key={level.code} value={level.code}>
                    {group.title} {level.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass}>
          Ajouter mon enfant
        </button>
      </form>

      {items.length > 0 && (
        <form action={inviteTutorAction} className={`${cardClass} space-y-4`}>
          <h2 className="text-xl font-bold">Inviter un répétiteur</h2>
          <p>
            Le répétiteur peut voir les progrès des enfants que vous choisissez, sans rien pouvoir
            modifier. Vous pouvez retirer son accès à tout moment.
          </p>
          <fieldset className="space-y-2">
            <legend className="font-bold">Quels enfants ?</legend>
            {items.map((child) => (
              <label key={child.id} className="flex min-h-[44px] items-center gap-3">
                <input
                  type="checkbox"
                  name="learnerId"
                  value={child.id}
                  defaultChecked={items.length === 1}
                  className="h-6 w-6 accent-primary"
                />
                {child.displayName}
              </label>
            ))}
          </fieldset>
          <button type="submit" className={buttonClass}>
            Créer un code d’invitation
          </button>
        </form>
      )}
    </section>
  );
}
