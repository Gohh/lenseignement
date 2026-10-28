import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@lenseignement/ui';
import { OfflineBadge } from '@/components/OfflineBadge';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SyncStatus } from '@/components/SyncStatus';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'L’Enseignement', template: '%s · L’Enseignement' },
  description:
    'Plateforme éducative mobile, accessible et utilisable à faible débit : primaire, technique, alphabétisation et formation des enseignants.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
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
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <OfflineBadge />
              <a
                href="/catalogue"
                className="inline-flex min-h-[44px] items-center whitespace-nowrap px-1 font-bold text-ink underline underline-offset-4"
              >
                Catalogue
              </a>
              <a
                href="/mon-espace"
                className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-card bg-primary px-3 font-bold text-surface no-underline sm:px-4"
              >
                Mon espace
              </a>
            </div>
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
