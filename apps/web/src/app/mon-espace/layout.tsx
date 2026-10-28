import type { ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { apiGet, type Me } from '@/lib/api';
import { AUTHOR_ROLES, VALIDATOR_ROLES } from '@/lib/roles';
import { getSession } from '@/lib/session';

// Menu latéral sur ordinateur ; barre fixe en bas sur téléphone (maquette « Mon espace »).
const linkClass =
  'flex min-h-[44px] flex-1 flex-col items-center justify-center whitespace-nowrap rounded-card px-3 text-sm font-bold text-ink-muted no-underline hover:bg-primary-soft aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-base lg:text-ink';

/** Menu de l'espace personnel, sur chaque page : on passe d'un outil à l'autre en un clic. */
export default async function MySpaceLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  // Sans session, chaque page renvoie elle-même vers la connexion.
  if (!session) return children;

  const me = await apiGet<Me>(session.accessToken, '/me');
  const memberRoles = new Set(me.ok ? me.data.memberships.map((m) => m.role) : []);
  const has = (roles: Set<string>) => [...memberRoles].some((role) => roles.has(role));
  const learner = session.roles.includes('apprenant');

  const items: Array<{ href: string; label: string; section?: boolean }> = [
    { href: '/mon-espace', label: 'Vue d’ensemble' },
    ...(learner
      ? [
          { href: '/mon-espace/bilan-lecture', label: 'Mon bilan' },
          { href: '/mon-espace/atelier-securite', label: 'Atelier' },
        ]
      : []),
    ...(has(AUTHOR_ROLES) ? [{ href: '/mon-espace/cours', label: 'Rédiger', section: true }] : []),
    ...(has(VALIDATOR_ROLES)
      ? [
          { href: '/mon-espace/relecture', label: 'Relecture' },
          { href: '/mon-espace/statistiques', label: 'Statistiques' },
        ]
      : []),
  ];

  const single = items.length <= 1;

  return (
    <div className={single ? undefined : 'pb-24 lg:flex lg:items-start lg:gap-6 lg:pb-0'}>
      {!single && (
        <nav
          aria-label="Menu de mon espace"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-2 pb-2 pt-1 lg:static lg:w-60 lg:flex-none lg:rounded-big lg:border lg:p-3"
        >
          <ul className="flex gap-1 overflow-x-auto lg:flex-col" role="list">
            {items.map((item) => (
              <li key={item.href} className="flex flex-1 lg:flex-none">
                <NavLink href={item.href} section={item.section} className={linkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
