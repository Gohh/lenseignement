'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Lecteur PDF (pdf.js), chargé seulement quand on ouvre un PDF. */
let ready: Promise<typeof import('pdfjs-dist')> | undefined;

function pdfjs() {
  ready ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    );
    return lib;
  });
  return ready;
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  return lib.getDocument({ data }).promise;
}

/** Dessine une page à la hauteur voulue et renvoie une image (adresse locale). */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  index: number,
  heightPx: number,
  type: 'image/png' | 'image/jpeg' = 'image/png',
): Promise<Blob> {
  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: heightPx / base.height });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  page.cleanup();
  if (!blob) throw new Error('Page illisible');
  return blob;
}

export async function pdfPageText(doc: PDFDocumentProxy, index: number): Promise<string> {
  const page = await doc.getPage(index + 1);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export async function pdfAspect(doc: PDFDocumentProxy): Promise<number> {
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  return viewport.width / viewport.height;
}
