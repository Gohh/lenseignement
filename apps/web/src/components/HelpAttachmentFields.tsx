'use client';

import { useRef, useState } from 'react';

const MAX_SIDE = 1280;
const MAX_SECONDS = 60;

/** Remplit un champ fichier caché, que le formulaire enverra comme les autres champs. */
function setFile(input: HTMLInputElement | null, file: File | null) {
  if (!input) return;
  const transfer = new DataTransfer();
  if (file) transfer.items.add(file);
  input.files = transfer.files;
}

/** Réduit la photo (côté long 1280 px, JPEG) : elle part vite, même avec peu de réseau. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.8));
  if (!blob) throw new Error('Photo illisible');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

/**
 * Photo (appareil photo ou galerie) et message vocal d'une question d'aide. Sans micro ou sans
 * enregistreur, l'élève garde la photo et le texte : rien n'est obligatoire.
 */
export function HelpAttachmentFields() {
  const photoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canRecord = typeof window !== 'undefined' && 'MediaRecorder' in window;

  async function choosePhoto(file: File | undefined) {
    setProblem(null);
    if (!file) return (setFile(photoInput.current, null), setPhotoName(null));
    try {
      setFile(photoInput.current, await shrink(file));
      setPhotoName(file.name);
    } catch {
      setFile(photoInput.current, null);
      setPhotoName(null);
      setProblem('Cette photo ne peut pas être lue. Essaie une autre photo.');
    }
  }

  async function start() {
    setProblem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream);
      recorder.current = media;
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const type = media.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        setFile(audioInput.current, new File([blob], `voix.${extension}`, { type }));
        setAudioUrl(URL.createObjectURL(blob));
        setRecording(false);
      };
      media.start();
      setRecording(true);
      timer.current = setTimeout(
        () => media.state === 'recording' && media.stop(),
        MAX_SECONDS * 1000,
      );
    } catch {
      setProblem('Le micro n’est pas disponible. Tu peux écrire ta question à la place.');
    }
  }

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  function discard() {
    setFile(audioInput.current, null);
    setAudioUrl(null);
  }

  return (
    <div className="space-y-4">
      <input ref={photoInput} type="file" name="photo" className="hidden" tabIndex={-1} />
      <input ref={audioInput} type="file" name="audio" className="hidden" tabIndex={-1} />

      <div>
        <label className="block font-bold" htmlFor="help-photo">
          Ajouter une photo (facultatif)
        </label>
        <input
          id="help-photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block min-h-[44px]"
          onChange={(event) => void choosePhoto(event.target.files?.[0])}
        />
        {photoName && <p className="text-ink-muted">Photo prête : {photoName}</p>}
      </div>

      {canRecord && (
        <div>
          <p className="font-bold">Dire ta question à voix haute (facultatif, 1 minute au plus)</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {recording ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex min-h-[44px] items-center rounded-card border border-primary bg-primary-soft px-4 font-bold text-primary"
              >
                Arrêter l’enregistrement
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void start()}
                className="inline-flex min-h-[44px] items-center rounded-card border border-primary px-4 font-bold text-primary"
              >
                {audioUrl ? 'Recommencer' : 'Enregistrer ma voix'}
              </button>
            )}
            {audioUrl && !recording && (
              <button
                type="button"
                onClick={discard}
                className="inline-flex min-h-[44px] items-center font-bold underline"
              >
                Supprimer l’enregistrement
              </button>
            )}
          </div>
          <p role="status" className="text-ink-muted">
            {recording ? 'Enregistrement en cours…' : ''}
          </p>
          {audioUrl && !recording && <audio controls src={audioUrl} className="mt-1 w-full" />}
        </div>
      )}
      {problem && (
        <p role="alert" className="font-bold">
          {problem}
        </p>
      )}
    </div>
  );
}
