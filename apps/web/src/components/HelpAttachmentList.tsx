import type { HelpAttachment } from '@lenseignement/types';

/** Photo et message vocal d'une question, servis par la page `pieces` (jeton côté serveur). */
export function HelpAttachmentList({ attachments }: { attachments: HelpAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {attachments.map((a) =>
        a.kind === 'photo' ? (
          <a
            key={a.id}
            href={`/mon-espace/pieces/${a.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={`/mon-espace/pieces/${a.id}`}
              alt="Photo jointe à la question"
              className="max-h-64 rounded-card border border-line"
            />
          </a>
        ) : (
          <audio key={a.id} controls src={`/mon-espace/pieces/${a.id}`} className="w-full">
            <track kind="captions" />
          </audio>
        ),
      )}
    </div>
  );
}
