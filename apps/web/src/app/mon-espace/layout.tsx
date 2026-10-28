import type { ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { apiGet, type Me } from '@/lib/api';
import { AUTHOR_ROLES, VALIDATOR_ROLES } from '@/lib/roles';
import { getSession } from '@/lib/session';

const linkClass =
  'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border-2 border-primary-line bg-surface px-4 font-bold text-ink-strong no-underline hover:border-primary aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-surface';

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

  return (
    <>
      {items.length > 1 && (
        <nav aria-label="Menu de mon espace" className="mb-6">
          <ul className="flex flex-wrap gap-2" role="list">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} section={item.section} className={linkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {children}
    </>
  );
}
