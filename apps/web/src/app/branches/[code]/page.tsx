import { BRANCHES } from '@lenseignement/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{ code: string }>;
}

export function generateStaticParams() {
  return BRANCHES.map((branch) => ({ code: branch.code }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const branch = BRANCHES.find((b) => b.code === code);
  return { title: branch?.title ?? 'Espace' };
}

export default async function BranchPage({ params }: Props) {
  const { code } = await params;
  const branch = BRANCHES.find((b) => b.code === code);
  if (!branch) notFound();

  return (
    <article className="space-y-4">
      <p>
        <a href="/" className="text-primary underline underline-offset-4">
          ← Retour à l’accueil
        </a>
      </p>
      <h1 className="text-3xl font-bold">{branch.title}</h1>
      <p className="text-lg">{branch.summary}</p>
      <p className="text-ink-muted">Public : {branch.audience}</p>
      <p>
        <a
          href={`/branches/${branch.code}/programme`}
          className="inline-flex min-h-[44px] items-center font-bold text-primary underline underline-offset-4"
        >
          Voir le programme et les compétences
        </a>
      </p>
      <p className="rounded-card border border-line bg-surface p-4">
        Les parcours de démonstration de cet espace arriveront avec les tickets 8 à 13 (cours,
        leçons texte/audio, quiz et progression).
      </p>
    </article>
  );
}
