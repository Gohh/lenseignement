import type { LibraryFormat } from '@lenseignement/types';

export const FORMAT_LABELS: Record<LibraryFormat, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  images: 'Images',
  audio: 'Audio',
  video: 'Vidéo',
  lien: 'Lien',
};

export const FORMAT_ICONS: Record<LibraryFormat, string> = {
  pdf: '📕',
  epub: '📗',
  images: '🖼️',
  audio: '🎵',
  video: '🎬',
  lien: '🔗',
};

/** Couleurs claires : le texte de la couverture est alors foncé (l'orange reste un fond). */
const LIGHT = new Set(['#e97824', '#c9a227']);
export function coverInk(color: string): string {
  return LIGHT.has(color.toLowerCase()) ? '#2e1500' : '#ffffff';
}

/** Format d'un fichier choisi : par son type, sinon par son extension. */
export function formatOfFile(file: File): LibraryFormat | 'office' | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const type = file.type.toLowerCase();
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type === 'application/epub+zip' || ext === 'epub') return 'epub';
  if (/^image\/(jpeg|png|webp)$/.test(type) || ['jpg', 'jpeg', 'png', 'webp'].includes(ext))
    return 'images';
  if (type.startsWith('audio/') || ['mp3', 'm4a', 'ogg', 'wav', 'weba'].includes(ext))
    return 'audio';
  if (/^video\/(mp4|webm)$/.test(type) || ['mp4', 'webm'].includes(ext)) return 'video';
  if (['doc', 'docx', 'odt', 'ppt', 'pptx', 'odp', 'xls', 'xlsx', 'rtf'].includes(ext))
    return 'office';
  return null;
}

/** Type exact envoyé au serveur (certains navigateurs ne le donnent pas pour l'EPUB). */
export function mimeOfFile(file: File, format: LibraryFormat): string {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    epub: 'application/epub+zip',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    weba: 'audio/webm',
    mp4: 'video/mp4',
    webm: format === 'audio' ? 'audio/webm' : 'video/webm',
  };
  if (format === 'pdf') return 'application/pdf';
  if (format === 'epub') return 'application/epub+zip';
  return file.type || byExt[ext] || 'application/octet-stream';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
