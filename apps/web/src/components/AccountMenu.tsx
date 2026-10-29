import { apiGet, type Me } from '@/lib/api';
import { getSession } from '@/lib/session';
import { spaceMenuItems } from '@/lib/space-menu';

/** Après l'inscription : choisir son profil (apprenant, parent, répétiteur, équipe). */
const WELCOME = '/mon-espace/bienvenue';

const itemClass =
  'flex min-h-[44px] items-center rounded-card px-3 font-bold text-ink no-underline hover:bg-primary-soft';

/** Deux lettres au plus, tirées du nom affiché. */
function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Coin droit de l'en-tête : « Se connecter » / « Créer mon compte » pour un visiteur ; pour une
 * personne connectée, un bouton à ses initiales qui ouvre son menu (espace, compte, déconnexion).
 * `<details>` fonctionne sans JavaScript, donc aussi hors ligne.
 */
export async function AccountMenu() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <a
          href="/auth/login"
          className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 font-bold text-ink no-underline hover:bg-primary-soft"
        >
          Se connecter
        </a>
        <a
          href={`/auth/login?inscription=1&returnTo=${encodeURIComponent(WELCOME)}`}
          className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-primary px-4 font-bold text-surface no-underline shadow-[var(--shadow-press)] hover:bg-primary-dark sm:px-5"
        >
          Créer mon compte
        </a>
      </div>
    );
  }

  const me = await apiGet<Me>(session.accessToken, '/me');
  const items = spaceMenuItems(session.roles, me.ok ? me.data : null);

  return (
    <details className="relative">
      <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full bg-primary font-display text-lg font-extrabold text-surface shadow-[var(--shadow-press)] marker:hidden [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">{initialsOf(session.displayName)}</span>
        <span className="sr-only">Mon compte : {session.displayName}</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 rounded-big border border-line bg-surface p-2 shadow-soft">
        <p className="px-3 py-2 text-sm text-ink-muted">
          Connecté : <span className="font-bold text-ink">{session.displayName}</span>
        </p>
        <nav aria-label="Menu du compte">
          <ul role="list">
            {items.map((item) => (
              <li key={item.href}>
                <a href={item.href} className={itemClass}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <hr className="my-2 border-line" />
        <a href="/mon-espace/compte" className={itemClass}>
          Modifier mon compte
        </a>
        <form method="post" action="/auth/logout">
          <button type="submit" className={`${itemClass} w-full text-left`}>
            Se déconnecter
          </button>
        </form>
      </div>
    </details>
  );
}
