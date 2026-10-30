/** Pied de page commun à toutes les pages : une ligne discrète et centrée. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line" data-testid="site-footer">
      <p className="mx-auto max-w-6xl px-4 py-4 text-center text-sm text-ink-muted">
        © {new Date().getFullYear()} L’Enseignement · Projet indépendant · Les attestations ne sont
        pas des diplômes d’État
      </p>
    </footer>
  );
}
