import { oralItems, type OralTestDetail } from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { secondaryButtonClass } from '@/components/Notice';
import { PrintButton } from '@/app/mon-espace/statistiques/PrintButton';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Feuille de l’élève' };

/** Ce que l'élève lit, en gros caractères : une page par partie, à imprimer ou à montrer. */
export default async function OralSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/oral/${id}/feuille`);
  const res = await apiGet<OralTestDetail>(session.accessToken, `/oral/tests/${id}`);
  if (!res.ok) notFound();
  const test = res.data;
  const timed = test.parts.filter((p) => p.kind !== 'questions');

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/mon-espace/oral/${test.id}`}
          className="inline-flex min-h-[44px] items-center underline"
        >
          ← {test.title}
        </Link>
        <PrintButton className={secondaryButtonClass} />
      </div>
      <p className="text-ink-muted print:hidden">
        L’élève lit cette feuille ; vous notez sur votre écran. Les questions ne sont pas écrites
        ici : vous les posez à voix haute.
      </p>
      {timed.map((part, i) => {
        const items = oralItems(part);
        return (
          <article
            key={i}
            className="space-y-4 rounded-big border border-line bg-surface p-6 print:break-after-page print:border-0"
          >
            <h2 className="font-display text-xl font-bold">{part.title}</h2>
            {part.kind === 'grille' ? (
              <ol className="grid grid-cols-5 gap-x-4 gap-y-5 sm:grid-cols-10">
                {items.map((item, k) => (
                  <li key={k} className="text-center font-display text-3xl font-bold">
                    {item}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-display text-3xl leading-relaxed">{part.text}</p>
            )}
          </article>
        );
      })}
    </section>
  );
}
