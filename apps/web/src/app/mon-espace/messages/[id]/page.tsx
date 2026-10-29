import type { ConversationView } from '@lenseignement/types';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { sendMessageAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conversation' };

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export default async function ConversationPage({ params, searchParams }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/auth/login?returnTo=/mon-espace/messages/${id}`);
  const query = await searchParams;
  const result = await apiGet<ConversationView>(session.accessToken, `/conversations/${id}`);
  if (!result.ok) notFound();
  const { conversation: c, messages } = result.data;

  return (
    <section className="space-y-6">
      <Link href="/mon-espace/messages" className="inline-flex min-h-[44px] items-center font-bold">
        ← Messages
      </Link>
      <h1 className="text-3xl font-extrabold">{c.otherName}</h1>
      <p className="text-ink-muted">À propos de {c.learnerName}</p>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />
      <ul className="space-y-3" role="list" data-testid="chat">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-prose rounded-card border p-4 ${m.mine ? 'ml-auto border-primary bg-primary-soft' : 'border-line bg-surface'}`}
          >
            <p className="text-sm font-bold text-ink-muted">
              {m.mine ? 'Moi' : m.senderName} · {dateFormat.format(new Date(m.sentAt))}
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ul>
      <form action={sendMessageAction} className="space-y-3">
        <input type="hidden" name="conversationId" value={c.id} />
        <label className="block font-bold">
          Ma réponse
          <textarea name="body" rows={4} className={inputClass} required maxLength={4000} />
        </label>
        <button type="submit" className={buttonClass}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
