import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@lenseignement/ui';
import { OfflineBadge } from '@/components/OfflineBadge';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'L’Enseignement', template: '%s · L’Enseignement' },
  description:
    'Plateforme éducative mobile, accessible et utilisable à faible débit : primaire, technique, alphabétisation et formation des enseignants.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#146B46',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell headerActions={<OfflineBadge />}>{children}</AppShell>
      </body>
    </html>
  );
}
