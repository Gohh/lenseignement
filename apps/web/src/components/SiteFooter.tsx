import { Logo } from '@lenseignement/ui';

/**
 * Pied de page commun à toutes les pages : sur une ligne, le logo et le nom à gauche, la mention à
 * droite ; sur téléphone, les deux parties passent l'une sous l'autre, centrées.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface" data-testid="site-footer">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-4 text-center text-sm text-ink-muted sm:justify-between sm:text-left">
        <span className="inline-flex items-center gap-2 font-bold text-primary">
          <Logo size={22} />
          L’Enseignement
        </span>
        <span>
          © {new Date().getFullYear()} · Projet indépendant · Les attestations ne sont pas des
          diplômes d’État
        </span>
      </div>
    </footer>
  );
}
