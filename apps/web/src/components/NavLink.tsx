'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface Props {
  href: string;
  className: string;
  children: ReactNode;
  /** Actif aussi sur les pages en dessous (ex. /catalogue/…). */
  section?: boolean;
}

/**
 * Lien de menu qui signale la page en cours (`aria-current`). Reste un vrai lien `<a>` : chaque
 * page est une vraie navigation, que le service worker peut garder pour le hors ligne (ADR-012).
 */
export function NavLink({ href, className, children, section = false }: Props) {
  const pathname = usePathname();
  const current = pathname === href || (section && pathname.startsWith(`${href}/`));
  return (
    <a href={href} className={className} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  );
}
