'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  /** Replié par défaut ; ouvert quand même s'il contient la page en cours. */
  closed?: boolean;
  /** Chemins des entrées, pour savoir si la page en cours est dans la rubrique. */
  hrefs: string[];
  children: ReactNode;
}

/** Rubrique repliable du menu d'administration ; fonctionne aussi sans JavaScript. */
export function MenuGroup({ title, closed = false, hrefs, children }: Props) {
  const pathname = usePathname();
  const active = hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`));
  return (
    <details open={!closed || active} className="group" data-tour={`groupe-${title}`}>
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between px-3 text-xs font-bold uppercase tracking-widest text-surface/80 marker:hidden hover:text-surface [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      {children}
    </details>
  );
}
