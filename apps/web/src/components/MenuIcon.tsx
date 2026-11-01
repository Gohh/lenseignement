// Pictogrammes du menu d'administration : traits simples, 24 × 24, couleur du texte.

const PATHS = {
  accueil: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  suivi: 'M3 12h4l3-7 4 14 3-7h4',
  statistiques: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  classe: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  devoirs: 'M9 4h6v3H9zM6 6h3M15 6h3v15H6V6M9 12l2 2 4-4',
  evaluations: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  bibliotheque: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 2.5 15.5-3.5 1z',
  messages: 'M4 5h16v11H8l-4 4z',
  questions:
    'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5M12 17.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  travail: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  cours:
    'M4 5c3-1.5 5.5-1.5 8 0 2.5-1.5 5-1.5 8 0v14c-3-1.5-5.5-1.5-8 0-2.5-1.5-5-1.5-8 0zM12 5v14',
  relecture: 'M4 12l5 5L20 6',
  programmes: 'M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5',
  etablissements: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5M12 10v2',
  drena: 'M4 21V5l8-2 8 2v16M4 21h16M8 9h2M14 9h2M8 13h2M14 13h2M10 21v-4h4v4',
  services: 'M7 11l3-3 3 2 4-4 4 4M3 15l4-4M7 11l5 5 2-2 3 3M3 15l5 5',
  equipe:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.5M18 14c2 .8 3 3 3 6',
  invitations: 'M3 7h18v10H3zM3 7l9 6 9-6',
  comptes:
    'M4 5h16v14H4zM9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2M14 9h3M14 13h3',
  droits: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4',
  journal: 'M6 3h10l3 3v15H6zM9 9h7M9 13h7M9 17h4',
  consulter: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
} as const;

export type MenuIconName = keyof typeof PATHS;

export function MenuIcon({ name }: { name: MenuIconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
