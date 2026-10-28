/**
 * Design tokens (cahier directeur §4.2). Palette initiale à tester avec les utilisateurs.
 * Toute modification doit garder vert le test de contraste (tokens.test.ts).
 */
export const colors = {
  primary: '#146B46',
  primaryDark: '#0E4F33',
  primarySoft: '#EEF6F1',
  primaryLine: '#CFE3D7',
  focus: '#217A53',
  accent: '#E97824',
  accentSoft: '#FDE9D6',
  accentInk: '#7A3A0C',
  text: '#17253B',
  textStrong: '#10301F',
  textMuted: '#4A5A6E',
  background: '#FAFAF5',
  surface: '#FFFFFF',
  border: '#E2E7E1',
  borderStrong: '#64748B',
  error: '#A52A32',
  info: '#215C9A',
} as const;

export type ColorToken = keyof typeof colors;

export const radii = { sm: '12px', md: '16px', lg: '20px', xl: '24px' } as const;
export const motion = { fast: '150ms', base: '200ms', slow: '250ms' } as const;
export const minTouchTarget = '44px';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** Rapport de contraste WCAG 2.x entre deux couleurs hexadécimales #RRGGBB. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Couples fond/texte réellement utilisés dans l'interface, avec le seuil WCAG 2.2 AA applicable :
 * 4.5 pour du texte courant, 3 pour les composants d'interface et indicateurs de focus.
 * L'orange d'accent (2,8:1 sur fond clair) n'est JAMAIS utilisé comme couleur de texte :
 * il sert de fond, avec du texte bleu nuit.
 */
export const usedColorPairs: ReadonlyArray<{
  foreground: ColorToken;
  background: ColorToken;
  minRatio: 4.5 | 3;
  usage: string;
}> = [
  { foreground: 'text', background: 'background', minRatio: 4.5, usage: 'texte courant' },
  { foreground: 'text', background: 'surface', minRatio: 4.5, usage: 'texte sur carte' },
  { foreground: 'textMuted', background: 'surface', minRatio: 4.5, usage: 'texte secondaire' },
  { foreground: 'textMuted', background: 'background', minRatio: 4.5, usage: 'texte secondaire' },
  { foreground: 'surface', background: 'primary', minRatio: 4.5, usage: 'bouton principal' },
  { foreground: 'primary', background: 'surface', minRatio: 4.5, usage: 'lien' },
  { foreground: 'surface', background: 'primaryDark', minRatio: 4.5, usage: 'bouton survolé' },
  {
    foreground: 'primary',
    background: 'primarySoft',
    minRatio: 4.5,
    usage: 'étiquette, menu actif',
  },
  {
    foreground: 'textStrong',
    background: 'primarySoft',
    minRatio: 4.5,
    usage: 'texte sur fond vert clair',
  },
  { foreground: 'textStrong', background: 'background', minRatio: 4.5, usage: 'titres' },
  {
    foreground: 'accentInk',
    background: 'accentSoft',
    minRatio: 4.5,
    usage: 'étiquette orange clair',
  },
  { foreground: 'text', background: 'accent', minRatio: 4.5, usage: 'badge réussite' },
  { foreground: 'error', background: 'surface', minRatio: 4.5, usage: 'message d’erreur' },
  { foreground: 'info', background: 'surface', minRatio: 4.5, usage: 'message d’information' },
  { foreground: 'focus', background: 'background', minRatio: 3, usage: 'anneau de focus' },
  { foreground: 'focus', background: 'surface', minRatio: 3, usage: 'anneau de focus' },
  { foreground: 'borderStrong', background: 'surface', minRatio: 3, usage: 'bordure de champ' },
];
