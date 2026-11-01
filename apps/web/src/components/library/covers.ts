'use client';

import type { LibraryFormat } from '@lenseignement/types';

const COVER_HEIGHT = 420;

async function canvasToJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = COVER_HEIGHT / h;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = COVER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  if (!blob) throw new Error('image');
  return blob;
}

async function fromImageBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    return await canvasToJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Titre et couverture lus dans le fichier (PDF, EPUB, image), pour préremplir la fenêtre. */
export interface FileInfo {
  cover: Blob | null;
  title: string | null;
}

/**
 * Couverture tirée du fichier, sur l'ordinateur de l'enseignant : 1re page du PDF, couverture
 * de l'EPUB ou 1re image. Rien si le fichier n'en a pas (la couleur choisie sert alors).
 */
export async function inspectFile(file: File, format: LibraryFormat): Promise<FileInfo> {
  try {
    if (format === 'images') return { cover: await fromImageBlob(file), title: null };
    if (format === 'pdf') {
      const { openPdf, renderPdfPage } = await import('./pdf');
      const doc = await openPdf(await file.arrayBuffer());
      try {
        const meta = await doc.getMetadata().catch(() => null);
        const title = (meta?.info as { Title?: string } | undefined)?.Title?.trim() || null;
        const cover = await fromImageBlob(await renderPdfPage(doc, 0, COVER_HEIGHT, 'image/png'));
        return { cover, title };
      } finally {
        void doc.loadingTask.destroy();
      }
    }
    if (format === 'epub') {
      const { default: ePub } = await import('epubjs');
      const book = ePub((await file.arrayBuffer()) as unknown as string);
      try {
        // Fermer le livre avant la fin de son ouverture provoque des erreurs dans epub.js.
        await book.ready;
        const title = (await book.loaded.metadata).title?.trim() || null;
        const url = await book.coverUrl();
        const cover = url ? await fromImageBlob(await (await fetch(url)).blob()) : null;
        return { cover, title };
      } finally {
        book.destroy();
      }
    }
  } catch {
    return { cover: null, title: null };
  }
  return { cover: null, title: null };
}
