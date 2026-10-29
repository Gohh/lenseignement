import type { MyWorkItem } from '@lenseignement/types';
import type { ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { StaffShell, topRoleLabel } from '@/components/StaffShell';
import { apiGet, type Me } from '@/lib/api';
import { spaceMenuItems, staffMenu } from '@/lib/space-menu';
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
  const staff = staffMenu(session.roles, me.ok ? me.data : null);
  if (staff) {
    // Les rôles d'équipe viennent des rattachements autant que du jeton.
    const roles = [...session.roles, ...(me.ok ? me.data.memberships.map((m) => m.role) : [])];
    const work = await apiGet<{ items: MyWorkItem[] }>(session.accessToken, '/authoring/my-work');
    return (
      <StaffShell
        menu={staff}
        displayName={session.displayName}
        roleLabel={topRoleLabel(roles)}
        taskCount={work.ok ? work.data.items.filter((i) => i.kind !== 'to_write').length : 0}
      >
        {children}
      </StaffShell>
    );
  }
  const items = spaceMenuItems(session.roles, me.ok ? me.data : null);

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
