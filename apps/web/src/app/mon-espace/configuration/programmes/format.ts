import type { AdminCurriculumVersion } from '@lenseignement/types';

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** « Brouillon », « En vigueur depuis le… », « À venir… » ou « Ancienne version… ». */
export function versionState(v: AdminCurriculumVersion, today: string): string {
  if (v.status === 'draft' || !v.effectiveFrom) return 'Brouillon (non publié)';
  if (v.effectiveFrom > today) return `À venir : en vigueur le ${formatDate(v.effectiveFrom)}`;
  if (v.effectiveTo && v.effectiveTo <= today) {
    return `Ancienne version : du ${formatDate(v.effectiveFrom)} au ${formatDate(v.effectiveTo)}`;
  }
  return `En vigueur depuis le ${formatDate(v.effectiveFrom)}`;
}
