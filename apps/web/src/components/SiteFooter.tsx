import { Logo } from '@lenseignement/ui';

/**
 * Pied de page commun à toutes les pages : le logo et le nom à gauche, sous le menu de l'espace ; la
 * mention centrée sous la colonne du contenu (mêmes largeurs que StaffShell). Sur téléphone, les
 * deux parties passent l'une sous l'autre, centrées.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface" data-testid="site-footer">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-4 text-center text-sm text-ink-muted lg:flex-row lg:gap-6">
        <span className="inline-flex items-center gap-2 font-bold text-primary lg:w-64 lg:flex-none">
          <Logo size={22} />
          L’Enseignement
        </span>
        <span className="lg:flex-1">
          © {new Date().getFullYear()} · Projet indépendant · Les attestations ne sont pas des
          diplômes d’État
        </span>
      </div>
    </footer>
  );
}
