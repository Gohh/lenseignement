import { redirect } from 'next/navigation';

/** Ancienne adresse de l'atelier : il est désormais dans le catalogue des ateliers. */
export default function OldWorkshopPage() {
  redirect('/mon-espace/atelier');
}
