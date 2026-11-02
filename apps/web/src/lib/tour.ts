import type { SpaceMenuItem, StaffMenu } from './space-menu';

// Visite guidée : quelques bulles qui montrent chaque partie de l'écran, avec des mots simples.
// Les étapes suivent le menu réel de la personne : elle ne voit que ce qu'elle peut utiliser.

export interface TourStep {
  /** Élément montré (attribut data-tour) ; sans cible, la bulle parle de la page entière. */
  target?: string;
  title: string;
  text: string;
}

const list = (labels: string[]) =>
  labels.length > 1 ? `${labels.slice(0, -1).join(', ')} et ${labels.at(-1)}` : (labels[0] ?? '');

const GROUP_TEXTS: Record<string, string> = {
  Piloter:
    'Les chiffres et le suivi : qui avance, qui décroche, où agir en premier ; les campagnes d’évaluation de zone.',
  Enseigner:
    'Vos classes au quotidien : devoirs, évaluations, évaluations orales, classe virtuelle et messages.',
  Contenus: 'Écrire, relire et publier les cours, les ateliers, les exercices et les épreuves.',
  'Réseau scolaire': 'Les établissements, les directions régionales, les services et partenaires.',
  Personnes: 'Votre équipe, les invitations et les comptes.',
  Administration: 'Les réglages de toute la plateforme et le journal des actions.',
  Consulter: 'Tout voir en lecture seule, sans rien modifier.',
};

export const tourKey = (title: string) => `groupe-${title}`;

/** Visite de l'espace d'administration (équipes, enseignants, directions…). */
export function staffTour(menu: StaffMenu): TourStep[] {
  return [
    {
      title: 'Bienvenue dans votre espace',
      text: 'En une minute, voici où trouver chaque chose. Avancez avec « Suivant », ou quittez quand vous voulez.',
    },
    {
      target: 'accueil',
      title: menu.main[0]?.label ?? 'Tableau de bord',
      text: 'Votre point de départ : l’essentiel du jour, en chiffres et en tâches.',
    },
    ...menu.groups.map((group) => ({
      target: tourKey(group.title),
      title: group.title,
      text: `${GROUP_TEXTS[group.title] ?? ''} Vous y trouvez : ${list(group.items.map((i) => i.label))}.`.trim(),
    })),
    {
      target: 'recherche',
      title: 'Rechercher',
      text: 'Tapez le nom d’un établissement pour le retrouver tout de suite.',
    },
    {
      target: 'cloche',
      title: 'Vos tâches',
      text: 'Le chiffre sur la cloche compte ce qui vous attend : contenus à relire, travail à finir.',
    },
    {
      target: 'compte',
      title: 'Votre compte',
      text: 'Le rond à vos initiales : votre nom, votre mot de passe et la déconnexion.',
    },
    {
      target: 'visite',
      title: 'C’est tout !',
      text: 'Pour revoir cette visite plus tard, cliquez sur « Visite guidée ».',
    },
  ];
}

const SIMPLE_TEXTS: Record<string, string> = {
  '/mon-espace': 'Ce qui compte aujourd’hui, en un coup d’œil.',
  '/mon-espace/bilan-lecture': 'Où tu en es : ce que tu sais déjà et ce qu’il faut revoir.',
  '/mon-espace/atelier': 'Les exercices pratiques de ton métier.',
  '/mon-espace/classe':
    'Ta classe : entre le code donné par ton école pour la rejoindre, puis retrouve la classe virtuelle.',
  '/mon-espace/devoirs':
    'Les devoirs à faire et à rendre. Tu peux en garder sur le téléphone pour les faire sans connexion.',
  '/mon-espace/evaluations': 'Tes notes et les corrections.',
  '/mon-espace/bibliotheque': 'Des livres, des sons et des vidéos, à garder sur l’appareil.',
  '/mon-espace/reussites': 'Tes badges et tes progrès.',
  '/mon-espace/aide': 'Pose une question à un tuteur, avec une photo ou ta voix.',
  '/mon-espace/famille':
    'Suivez vos enfants : reliez chaque enfant avec le code donné par son école.',
  '/mon-espace/messages': 'Écrivez aux enseignants de vos enfants.',
  '/mon-espace/repetiteur': 'Les élèves que vous accompagnez et leurs progrès.',
  '/mon-espace/questions': 'Les questions des élèves qui attendent votre réponse.',
  '/mon-espace/equipe': 'Les personnes de votre équipe.',
  '/mon-espace/configuration': 'Votre établissement et ses réglages.',
  '/mon-espace/cours': 'Écrire des cours.',
  '/mon-espace/relecture': 'Relire les cours avant publication.',
  '/mon-espace/statistiques': 'Les chiffres de vos classes.',
};

export const menuTourKey = (href: string) => `menu-${href}`;

/** Visite de l'espace simple (élèves, parents, répétiteurs). */
export function simpleTour(items: SpaceMenuItem[]): TourStep[] {
  return [
    {
      title: 'Bienvenue !',
      text: 'Voici ton espace. Suis les bulles pour découvrir chaque bouton. Tu peux écouter chaque bulle avec 🔊.',
    },
    ...items.map((item) => ({
      target: menuTourKey(item.href),
      title: item.label,
      text: SIMPLE_TEXTS[item.href] ?? 'Une partie de votre espace.',
    })),
    {
      target: 'catalogue',
      title: 'Catalogue',
      text: 'Toutes les leçons, rangées par niveau. Une leçon commencée reste gardée, même sans réseau.',
    },
    {
      target: 'compte',
      title: 'Ton compte',
      text: 'Le rond à tes initiales : ton nom, ton mot de passe et la déconnexion.',
    },
    {
      target: 'visite',
      title: 'C’est tout !',
      text: 'Pour revoir cette visite, appuie sur « Visite guidée ».',
    },
  ];
}

/** Visite de l'accueil, pour un visiteur pas encore inscrit. */
export const PUBLIC_TOUR: TourStep[] = [
  {
    title: 'Bienvenue sur L’Enseignement',
    text: 'Des leçons courtes à écouter, des quiz et une progression gardée, même avec peu de réseau.',
  },
  {
    target: 'niveaux',
    title: 'Choisir son niveau',
    text: 'École, secondaire, alphabétisation ou métier : touchez votre niveau pour voir ses leçons.',
  },
  {
    target: 'catalogue',
    title: 'Le catalogue',
    text: 'Toutes les leçons au même endroit. La première leçon de chaque cours est ouverte à tous.',
  },
  {
    target: 'compte',
    title: 'Créer mon compte',
    text: 'Gratuit. Votre progression est alors gardée, et vous retrouvez votre classe, vos devoirs et vos notes.',
  },
];
