'use client';

import { LIBRARY_COVER_COLORS, LIBRARY_FILE_RULES, type LibraryFormat } from '@lenseignement/types';
import { useEffect, useRef, useState } from 'react';
import {
  bookAddedAction,
  cancelBookAction,
  createBookAction,
} from '@/app/mon-espace/bibliotheque/actions';
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/Notice';
import { inspectFile } from './covers';
import {
  FORMAT_ICONS,
  FORMAT_LABELS,
  coverInk,
  formatOfFile,
  formatSize,
  mimeOfFile,
} from './formats';

export interface TeachingCohort {
  id: string;
  label: string;
}

/** Étagères proposées en plus de celles qui existent déjà. */
const SHELF_SUGGESTIONS = [
  'Lecture et contes',
  'Français',
  'Mathématiques',
  'Sciences',
  'Histoire et géographie',
  'Anglais',
  'Éducation civique',
  'Alphabétisation',
];

const ACCEPT = [
  '.pdf',
  '.epub',
  'application/pdf',
  'application/epub+zip',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/*',
  'video/mp4',
  'video/webm',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.odt',
  '.odp',
].join(',');

function upload(
  id: string,
  role: 'content' | 'cover',
  body: Blob,
  type: string,
  name: string,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/mon-espace/bibliotheque/envoi/${id}?role=${role}`);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.setRequestHeader('x-file-type', type);
    xhr.setRequestHeader('x-file-name', encodeURIComponent(name));
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = 'L’envoi du fichier a échoué.';
      try {
        message = (JSON.parse(xhr.responseText) as { message?: string }).message ?? message;
      } catch {
        // réponse non lisible
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Connexion interrompue pendant l’envoi.'));
    xhr.send(body);
  });
}

/** « Ajouter un livre » : un fichier (ou un lien), son étagère et sa couverture. */
export function AddBookDialog({
  cohorts,
  shelves,
}: {
  cohorts: TeachingCohort[];
  shelves: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'file' | 'link'>('file');
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<LibraryFormat | null>(null);
  const [title, setTitle] = useState('');
  const [shelf, setShelf] = useState('');
  const [color, setColor] = useState<string>(LIBRARY_COVER_COLORS[0]);
  const [cover, setCover] = useState<{ blob: Blob; url: string } | null>(null);
  const [useCover, setUseCover] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(
    () => () => {
      if (cover) URL.revokeObjectURL(cover.url);
    },
    [cover],
  );

  function reset() {
    setFiles([]);
    setFormat(null);
    setTitle('');
    setCover(null);
    setError(null);
    setProgress(null);
  }

  async function choose(list: FileList | File[]) {
    setError(null);
    const chosen = [...list];
    if (chosen.length === 0) return;
    const formats = chosen.map(formatOfFile);
    if (formats.includes('office')) {
      setError(
        'Les fichiers Word et PowerPoint ne s’ouvrent pas sur tous les appareils. Dans Word ou PowerPoint, faites « Fichier › Enregistrer sous › PDF », puis ajoutez le PDF.',
      );
      return;
    }
    const first = formats[0];
    if (!first || first === 'office' || formats.some((f) => f !== first)) {
      setError(
        'Ce type de fichier n’est pas accepté. Choisissez un PDF, un EPUB, des images, un audio ou une vidéo.',
      );
      return;
    }
    const rules = LIBRARY_FILE_RULES[first as Exclude<LibraryFormat, 'lien'>];
    if (chosen.length > rules.maxFiles) {
      setError(
        rules.maxFiles === 1
          ? 'Un seul fichier par livre (sauf pour un album d’images).'
          : `Au plus ${rules.maxFiles} images par album.`,
      );
      return;
    }
    const tooBig = chosen.find((f) => f.size > rules.maxBytes);
    if (tooBig) {
      setError(
        `« ${tooBig.name} » est trop lourd (${formatSize(tooBig.size)}). Maximum : ${formatSize(rules.maxBytes)}.`,
      );
      return;
    }
    if (first === 'images')
      chosen.sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    setFiles(chosen);
    setFormat(first);
    const fromName = chosen[0]!.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, 120);
    setTitle((t) => t || fromName);
    setCover(null);
    const info = await inspectFile(chosen[0]!, first);
    if (info.title) setTitle((t) => (t === fromName || !t ? info.title!.slice(0, 120) : t));
    if (info.cover) setCover({ blob: info.cover, url: URL.createObjectURL(info.cover) });
  }

  async function submit(form: FormData) {
    setError(null);
    const cohortId = String(form.get('cohortId') ?? '');
    const base = {
      title: title.trim(),
      shelf: shelf.trim() || undefined,
      author: String(form.get('author') ?? '').trim() || undefined,
      description: String(form.get('description') ?? '').trim() || undefined,
      coverColor: color as (typeof LIBRARY_COVER_COLORS)[number],
      offlineAllowed: form.get('offline') === 'on',
    };
    if (mode === 'link') {
      setProgress('Ajout…');
      const result = await createBookAction(cohortId, {
        ...base,
        format: 'lien',
        url: String(form.get('url') ?? '').trim(),
      });
      if (!result.ok) {
        setProgress(null);
        return setError(result.message);
      }
      return bookAddedAction();
    }
    if (!format || files.length === 0) return setError('Choisissez d’abord un fichier.');
    setProgress('Préparation…');
    const created = await createBookAction(cohortId, { ...base, format });
    if (!created.ok) {
      setProgress(null);
      return setError(created.message);
    }
    const totalBytes = files.reduce((n, f) => n + f.size, 0);
    let sent = 0;
    try {
      for (const file of files) {
        await upload(created.id, 'content', file, mimeOfFile(file, format), file.name, (loaded) =>
          setProgress(`Envoi… ${Math.round(((sent + loaded) / totalBytes) * 100)} %`),
        );
        sent += file.size;
      }
      if (cover && useCover) {
        await upload(created.id, 'cover', cover.blob, 'image/jpeg', 'couverture.jpg', () => {});
      }
    } catch (e) {
      await cancelBookAction(created.id);
      setProgress(null);
      return setError((e as Error).message);
    }
    setProgress('Terminé ✓');
    await bookAddedAction();
  }

  const shelfOptions = [...new Set([...shelves, ...SHELF_SUGGESTIONS])];
  const busy = progress !== null;
  const previewCover = cover && useCover ? cover.url : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          dialog.current?.showModal();
        }}
        className={buttonClass}
      >
        ＋ Ajouter un livre
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="add-book-title"
        className="m-auto max-h-[92vh] w-[min(94vw,52rem)] overflow-y-auto rounded-big border border-line bg-surface p-0 text-ink shadow-soft backdrop:bg-ink-strong/55"
        onCancel={(e) => busy && e.preventDefault()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id="add-book-title" className="text-2xl font-extrabold">
            Ajouter un livre
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => dialog.current?.close()}
            className="inline-flex min-h-[44px] items-center rounded-card px-4 font-bold text-primary hover:bg-primary-soft"
          >
            Fermer
          </button>
        </div>
        <form action={submit} className="space-y-5 p-6">
          <div className="flex gap-2" role="radiogroup" aria-label="Que voulez-vous ajouter ?">
            {(
              [
                ['file', '📚 Un fichier'],
                ['link', '🔗 Un lien internet'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={`min-h-[44px] rounded-pill border-2 px-4 font-bold ${
                  mode === value
                    ? 'border-primary bg-primary text-surface'
                    : 'border-line bg-surface text-ink-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'file' ? (
            <label
              className={`block cursor-pointer rounded-big border-[3px] border-dashed p-6 text-center ${
                dragging ? 'border-primary bg-primary-line' : 'border-primary-line bg-primary-soft'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void choose(e.dataTransfer.files);
              }}
            >
              <span className="block text-4xl" aria-hidden>
                {format ? FORMAT_ICONS[format] : '📚'}
              </span>
              {files.length > 0 ? (
                <span className="mt-1 block font-bold text-ink-strong">
                  {files.length === 1 ? files[0]!.name : `${files.length} images`} ·{' '}
                  {formatSize(files.reduce((n, f) => n + f.size, 0))}
                  <span className="block text-sm font-normal text-primary underline">
                    Choisir un autre fichier
                  </span>
                </span>
              ) : (
                <span className="mt-1 block text-lg">
                  <b className="text-ink-strong">Déposez le fichier ici</b> ou{' '}
                  <span className="font-bold text-primary underline">
                    choisissez-le sur l’ordinateur
                  </span>
                </span>
              )}
              <input
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => e.target.files && void choose(e.target.files)}
                data-testid="book-file"
              />
              <span className="mt-3 flex flex-wrap justify-center gap-2 text-sm font-bold">
                {['📕 PDF', '📗 EPUB', '🖼️ Images JPG, PNG', '🎵 Audio MP3', '🎬 Vidéo MP4'].map(
                  (f) => (
                    <span
                      key={f}
                      className="rounded-lg border-2 border-primary-line bg-surface px-2 py-1"
                    >
                      {f}
                    </span>
                  ),
                )}
              </span>
              <span className="mt-2 block text-sm text-ink-muted">
                Jusqu’à 50 Mo par fichier. Pour un album, choisissez plusieurs images. Word et
                PowerPoint : enregistrez-les d’abord en PDF.
              </span>
            </label>
          ) : (
            <label className="block font-bold">
              Lien (commence par https://)
              <input name="url" type="url" className={inputClass} required maxLength={500} />
            </label>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-card border-2 border-error bg-[#fdeeee] p-3 font-bold text-error"
            >
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-bold">
              Titre
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label className="block font-bold">
              Étagère (matière)
              <input
                value={shelf}
                onChange={(e) => setShelf(e.target.value)}
                list="library-shelves"
                className={inputClass}
                placeholder="ex. : Lecture et contes"
                maxLength={60}
              />
              <datalist id="library-shelves">
                {shelfOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="block font-bold">
              Classe
              <select name="cohortId" className={inputClass} required>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-bold">
              Auteur (facultatif)
              <input name="author" className={inputClass} maxLength={120} />
            </label>
          </div>
          <label className="block font-bold">
            Présentation (facultatif)
            <textarea name="description" rows={2} className={inputClass} maxLength={1000} />
          </label>

          <div className="flex flex-wrap items-end justify-between gap-5">
            <fieldset>
              <legend className="font-bold">Couverture</legend>
              <p className="text-sm text-ink-muted">
                {cover
                  ? 'Prise dans le fichier. Vous pouvez choisir une couleur à la place.'
                  : 'Choisissez une couleur.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {cover && (
                  <button
                    type="button"
                    onClick={() => setUseCover(true)}
                    aria-pressed={useCover}
                    aria-label="Couverture du fichier"
                    className={`h-16 w-12 overflow-hidden rounded-[3px_7px_7px_3px] ${useCover ? 'outline-3 outline-offset-2 outline-ink-strong' : ''}`}
                  >
                    <img src={cover.url} alt="" className="h-full w-full object-cover" />
                  </button>
                )}
                {LIBRARY_COVER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setColor(c);
                      setUseCover(false);
                    }}
                    aria-pressed={color === c && (!cover || !useCover)}
                    aria-label={`Couleur ${c}`}
                    className={`h-16 w-12 rounded-[3px_7px_7px_3px] shadow-[inset_4px_0_0_rgba(0,0,0,.18)] ${
                      color === c && (!cover || !useCover)
                        ? 'outline-3 outline-offset-2 outline-ink-strong'
                        : ''
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </fieldset>
            <div
              className="relative h-[150px] w-[108px] shrink-0 overflow-hidden rounded-[4px_10px_10px_4px] shadow-[5px_7px_12px_rgba(0,0,0,.22)]"
              style={{ background: color, color: coverInk(color) }}
              aria-hidden
            >
              {previewCover ? (
                <img src={previewCover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col p-3 pl-4">
                  <p className="font-display text-sm leading-tight font-extrabold">
                    {title || 'Titre du livre'}
                  </p>
                  <p className="mt-auto text-center text-3xl">
                    {FORMAT_ICONS[mode === 'link' ? 'lien' : (format ?? 'pdf')]}
                  </p>
                </div>
              )}
              <span className="absolute bottom-2 left-3 rounded bg-surface px-1 text-[10px] font-bold text-ink-strong">
                {FORMAT_LABELS[mode === 'link' ? 'lien' : (format ?? 'pdf')]}
              </span>
            </div>
          </div>

          {mode === 'file' && (
            <label className="flex min-h-[44px] items-center gap-3 font-bold">
              <input
                type="checkbox"
                name="offline"
                defaultChecked
                className="h-6 w-6 accent-[#146b46]"
              />
              Proposer aux élèves de le garder hors ligne
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={buttonClass} disabled={busy}>
              Ajouter à l’étagère
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Annuler
            </button>
            <p role="status" aria-live="polite" className="font-bold text-primary">
              {progress}
            </p>
          </div>
        </form>
      </dialog>
    </>
  );
}
