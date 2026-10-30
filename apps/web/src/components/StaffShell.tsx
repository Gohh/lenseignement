import type { MyEstablishment } from '@lenseignement/types';
import type { ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { setMyNameAction } from '@/app/mon-espace/nom-actions';
import { buttonClass, inputClass } from '@/components/Notice';
import type { StaffMenu } from '@/lib/space-menu';

const linkClass =
  'flex min-h-[44px] items-center rounded-card px-3 font-bold text-surface no-underline hover:bg-surface/15 aria-[current=page]:bg-surface aria-[current=page]:text-primary';

const ROLE_TITLES: Record<string, string> = {
  superadministrateur: 'Superadministrateur',
  administrateur: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  'chef-etablissement': 'Direction',
  'referent-pedagogique': 'Référent pédagogique',
  enseignant: 'Enseignant',
  alphabetiseur: 'Alphabétiseur',
};

/** Rôle le plus élevé, pour la carte en bas du menu. */
export function topRoleLabel(roles: readonly string[]): string {
  const order = Object.keys(ROLE_TITLES);
  const found = order.find((r) => roles.includes(r));
  return found ? ROLE_TITLES[found]! : 'Équipe';
}

function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

interface Props {
  menu: StaffMenu;
  displayName: string;
  roleLabel: string;
  /** Établissement de la personne : « L'Enseignement à … », sa DRENA et sa localité. */
  establishment: MyEstablishment | null;
  /** Compte sans nom enregistré : on le demande en haut de chaque page. */
  askName: boolean;
  /** Nombre de tâches qui attendent la personne (cloche). */
  taskCount: number;
  children: ReactNode;
}

/**
 * Espace d'administration : menu foncé à gauche (entrées, groupes repliables, carte de la personne),
 * barre du haut (établissement et date, recherche, cloche) puis la page. Tout fonctionne sans JavaScript.
 */
export function StaffShell({
  menu,
  displayName,
  roleLabel,
  establishment,
  askName,
  taskCount,
  children,
}: Props) {
  const today = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date());

  return (
    <div className="lg:flex lg:items-start lg:gap-6">
      <aside
        aria-label="Administration"
        className="flex flex-col gap-4 rounded-big bg-primary p-4 text-surface lg:sticky lg:top-4 lg:w-64 lg:flex-none"
      >
        <nav aria-label="Menu de mon espace" className="space-y-3">
          <ul role="list" className="space-y-1">
            {menu.main.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} section={item.section} className={linkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          {menu.groups.map((group) => (
            <details key={group.title} open className="group">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-3 text-sm font-bold uppercase tracking-widest text-surface/90 marker:hidden [&::-webkit-details-marker]:hidden">
                {group.title}
                <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <ul role="list" className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} section={item.section} className={linkClass}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </nav>
        <div className="mt-2 flex items-center gap-3 rounded-card bg-surface/10 p-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-surface font-display text-lg font-extrabold text-primary"
          >
            {initialsOf(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{displayName}</p>
            <p className="truncate text-sm text-surface">{roleLabel}</p>
          </div>
        </div>
        <form method="post" action="/auth/logout">
          <button
            type="submit"
            className="flex min-h-[44px] w-full items-center justify-center rounded-card border border-surface/40 font-bold text-surface hover:bg-surface/15"
          >
            Déconnexion
          </button>
        </form>
      </aside>

      <div className="mt-6 min-w-0 flex-1 space-y-6 lg:mt-0">
        <div className="flex flex-wrap items-center gap-3 rounded-big border border-line bg-surface px-4 py-2">
          <div className="min-w-0 flex-1 basis-56" data-testid="establishment">
            <p className="font-display text-lg font-extrabold leading-tight text-primary">
              L’Enseignement{establishment ? ` à ${establishment.name}` : ''}
            </p>
            <p className="text-sm text-ink-muted">
              {establishment &&
                [establishment.direction, establishment.locality]
                  .filter(Boolean)
                  .map((part) => `${part} · `)
                  .join('')}
              <span className="capitalize">{today}</span>
            </p>
          </div>
          <form
            action="/mon-espace/configuration"
            method="get"
            role="search"
            className="flex-1 basis-56"
          >
            <label className="sr-only" htmlFor="staff-search">
              Rechercher un établissement
            </label>
            <input
              id="staff-search"
              name="q"
              type="search"
              placeholder="Rechercher un établissement…"
              className="min-h-[44px] w-full rounded-full border border-line-strong bg-background px-4"
            />
          </form>
          <a
            href="/mon-espace/travail"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-line text-xl no-underline hover:bg-primary-soft"
          >
            <span aria-hidden="true">🔔</span>
            <span className="sr-only">
              Notifications : {taskCount} tâche{taskCount > 1 ? 's' : ''} à traiter
            </span>
            {taskCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-ink-strong"
              >
                {taskCount}
              </span>
            )}
          </a>
        </div>
        {askName && (
          <form
            action={setMyNameAction}
            data-testid="ask-name"
            className="flex flex-wrap items-end gap-3 rounded-big border-2 border-primary bg-primary-soft p-4"
          >
            <label className="block min-w-0 flex-1 basis-64 font-bold">
              Comment vous appelez-vous ? Votre nom s’affiche dans les listes et le journal.
              <input
                name="displayName"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                placeholder="Prénom et nom"
                className={inputClass}
              />
            </label>
            <button type="submit" className={buttonClass}>
              Valider mon nom
            </button>
          </form>
        )}
        {children}
      </div>
    </div>
  );
}
