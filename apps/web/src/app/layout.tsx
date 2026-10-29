import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@lenseignement/ui';
import { AccountMenu } from '@/components/AccountMenu';
import { NavLink } from '@/components/NavLink';
import { OfflineBadge } from '@/components/OfflineBadge';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SyncStatus } from '@/components/SyncStatus';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'L’Enseignement', template: '%s · L’Enseignement' },
  description:
    'Plateforme éducative mobile, accessible et utilisable à faible débit : primaire, technique, alphabétisation et formation des enseignants.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#146B46',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      {/* Certaines extensions (ex. Grammarly) ajoutent des attributs à <body> avant React :
          on ignore ces seuls écarts d'attributs, sans masquer ceux du contenu. */}
      <body suppressHydrationWarning>
        <AppShell
          headerActions={
            <nav
              aria-label="Menu principal"
              className="flex flex-wrap items-center justify-end gap-1 sm:gap-2"
            >
              <OfflineBadge />
              <NavLink
                href="/catalogue"
                section
                className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 font-bold text-ink no-underline hover:bg-primary-soft aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary"
              >
                Catalogue
              </NavLink>
              <AccountMenu />
            </nav>
          }
        >
          <SyncStatus />
          {children}
        </AppShell>
        <ServiceWorker />
      </body>
    </html>
  );
}
