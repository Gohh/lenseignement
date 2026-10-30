import { Logo } from '@lenseignement/ui';

const link =
  'inline-flex min-h-[44px] items-center text-surface underline decoration-surface/40 underline-offset-4 hover:decoration-surface';

/** Pied de page commun à toutes les pages, publiques comme connectées. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t-4 border-t-accent bg-primary text-surface"
      data-testid="site-footer"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:grid-cols-3">
        <div className="space-y-3">
          <p className="flex items-center gap-3 font-display text-xl font-extrabold text-surface">
            <span className="rounded-card bg-surface p-1">
              <Logo size={32} />
            </span>
            L’Enseignement
          </p>
          <p className="text-surface/90">
            Apprendre partout, même avec peu de connexion : préscolaire, primaire, secondaire,
            enseignement technique et alphabétisation.
          </p>
        </div>
        <nav aria-label="Liens du pied de page">
          <h2 className="font-display text-lg font-extrabold text-surface">Naviguer</h2>
          <ul className="mt-2" role="list">
            <li>
              <a href="/" className={link}>
                Accueil
              </a>
            </li>
            <li>
              <a href="/catalogue" className={link}>
                Catalogue des leçons
              </a>
            </li>
            <li>
              <a href="/mon-espace" className={link}>
                Mon espace
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="font-display text-lg font-extrabold text-surface">Bon à savoir</h2>
          <ul className="mt-2 space-y-2 text-surface/90" role="list">
            <li>Les leçons déjà ouvertes restent lisibles sans connexion.</li>
            <li>Utilisable sur téléphone, tablette et ordinateur.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-surface/20">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-surface/90">
          © {year} L’Enseignement. Projet indépendant. Aucune affiliation institutionnelle ; les
          attestations délivrées ne sont pas des diplômes d’État.
        </p>
      </div>
    </footer>
  );
}
