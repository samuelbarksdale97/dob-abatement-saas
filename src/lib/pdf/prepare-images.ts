import { pdfjs } from 'react-pdf';

// Ensure worker is configured (idempotent — may already be set by EvidencePhoto)
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

// Cache the PDF document to avoid re-downloading for each page
let cachedPdfUrl: string | null = null;
let cachedPdfDoc: pdfjs.PDFDocumentProxy | null = null;

/**
 * Render a specific page from a PDF to a JPEG data URL.
 * Uses pdfjs-dist (already loaded via react-pdf) to render to an offscreen canvas.
 */
export async function renderPdfPageToImage(
  pdfUrl: string,
  pageNumber: number,
  scale: number = 1.5,
): Promise<string> {
  // Reuse cached document if same URL
  if (pdfUrl !== cachedPdfUrl || !cachedPdfDoc) {
    cachedPdfDoc = await pdfjs.getDocument(pdfUrl).promise;
    cachedPdfUrl = pdfUrl;
  }

  const page = await cachedPdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvas, viewport }).promise;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  // Clean up to free memory
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

/**
 * Fetch a remote image (e.g. from a Supabase signed URL) and convert to a JPEG data URL.
 * Uses an offscreen Image + canvas to handle cross-origin.
 */
export async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      // Clean up
      canvas.width = 0;
      canvas.height = 0;
      resolve(dataUrl);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
}

/**
 * Get the natural dimensions of an image from its data URL.
 * Returns { width, height } in pixels.
 */
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to read image dimensions'));
    img.src = dataUrl;
  });
}
