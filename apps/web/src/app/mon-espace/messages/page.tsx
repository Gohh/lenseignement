import type { ConversationItem, MessageContact } from '@lenseignement/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, inputClass, Notice, param } from '@/components/Notice';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';
import { Dialog } from '../configuration/Dialog';
import { startConversationAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Messages' };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const cardClass = 'rounded-big border border-line bg-surface p-5 shadow-[var(--shadow-soft)]';
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export default async function MessagesPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/auth/login?returnTo=/mon-espace/messages');
  const query = await searchParams;
  const [conversations, contacts] = await Promise.all([
    apiGet<{ items: ConversationItem[] }>(session.accessToken, '/me/conversations'),
    apiGet<{ items: MessageContact[] }>(session.accessToken, '/me/message-contacts'),
  ]);
  const items = conversations.ok ? conversations.data.items : [];
  const people = contacts.ok ? contacts.data.items : [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Messages</h1>
        {people.length > 0 && (
          <Dialog
            label="+ Nouveau message"
            title="Nouveau message"
            primary
            openAtStart={param(query.ouvrir as string | undefined) === 'nouveau'}
          >
            <form action={startConversationAction} className="space-y-4">
              <label className="block font-bold">
                À qui, à propos de quel enfant
                <select name="contact" className={inputClass} required>
                  {people.map((p) => (
                    <option
                      key={`${p.learnerId}|${p.otherUserId}`}
                      value={`${p.learnerId}|${p.otherUserId}`}
                    >
                      {p.otherName} ({p.otherRole === 'enseignant' ? 'enseignant' : 'parent'}) ·
                      élève : {p.learnerName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block font-bold">
                Message
                <textarea name="body" rows={5} className={inputClass} required maxLength={4000} />
              </label>
              <button type="submit" className={buttonClass}>
                Envoyer
              </button>
            </form>
          </Dialog>
        )}
      </div>
      <Notice
        message={param(query.message as string | undefined)}
        error={param(query.erreur as string | undefined)}
      />

      <div className={cardClass}>
        {items.length === 0 ? (
          <p>
            {people.length > 0
              ? 'Aucune conversation pour le moment. Écris un premier message.'
              : 'Tu pourras écrire ici dès qu’un enfant sera relié à une classe.'}
          </p>
        ) : (
          <ul className="space-y-3" role="list" data-testid="conversations">
            {items.map((c) => (
              <li key={c.id} className="rounded-card border border-line p-4">
                <Link
                  href={`/mon-espace/messages/${c.id}`}
                  className="inline-flex min-h-[44px] items-center text-lg font-bold underline"
                >
                  {c.otherName}
                  <span className="sr-only"> à propos de {c.learnerName}</span>
                </Link>
                {c.unread > 0 && (
                  <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-sm font-bold text-ink-strong">
                    {c.unread} non lu{c.unread > 1 ? 's' : ''}
                  </span>
                )}
                <p className="text-ink-muted">
                  Élève : {c.learnerName} · {dateFormat.format(new Date(c.lastAt))}
                </p>
                <p className="truncate">{c.lastMessage}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
