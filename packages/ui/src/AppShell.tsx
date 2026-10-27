import type { ReactNode } from 'react';

export interface AppShellProps {
  children: ReactNode;
  /** Zone droite de l'en-tête (état hors ligne, connexion…). */
  headerActions?: ReactNode;
}

/** Structure de page commune : lien d'évitement, en-tête, contenu principal et pied de page. */
export function AppShell({ children, headerActions }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-surface focus:px-4 focus:py-3 focus:text-ink"
      >
        Aller au contenu
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <a href="/" className="text-xl font-bold text-primary no-underline">
            L’Enseignement
          </a>
          {headerActions}
        </div>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-5xl px-4 py-4 text-sm text-ink-muted">
          Projet indépendant de démonstration. Aucune affiliation institutionnelle ; les
          attestations délivrées ne sont pas des diplômes d’État.
        </p>
      </footer>
    </div>
  );
}
