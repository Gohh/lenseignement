import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Hors connexion' };

/** Page montrée sans réseau quand la page demandée n'est pas gardée sur l'appareil (ADR-012). */
export default function OfflinePage() {
  return (
    <section className="mx-auto max-w-prose space-y-4">
      <h1 className="text-3xl font-bold">Pas de connexion</h1>
      <p className="text-lg">
        Cette page n’est pas encore gardée sur cet appareil. Elle s’ouvrira quand internet
        reviendra.
      </p>
      <p>
        Les cours gardés avec le bouton « Garder ce cours sur cet appareil » et les pages déjà
        ouvertes restent lisibles. Vos leçons terminées et vos réponses aux quiz sont gardées, puis
        envoyées automatiquement au retour du réseau.
      </p>
      <Link href="/catalogue" className="inline-flex min-h-[44px] items-center font-bold underline">
        Aller au catalogue
      </Link>
    </section>
  );
}
