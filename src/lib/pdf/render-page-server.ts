/**
 * Server-side PDF page renderer.
 * Uses pdf-to-img (pdfjs + canvas) to render individual PDF pages to PNG buffers.
 * Designed for use in Inngest functions / API routes (Node.js environment).
 */

interface RenderedPage {
  pageNumber: number;
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Render specific pages from a PDF buffer to PNG images.
 * @param pdfBuffer - The raw PDF file as a Buffer
 * @param pageNumbers - 1-indexed page numbers to render
 * @param scale - Render scale (1.0 = 72 DPI, 2.0 = 144 DPI)
 * @returns Array of rendered page objects with PNG buffers
 */
export async function renderPdfPages(
  pdfBuffer: Buffer,
  pageNumbers: number[],
  scale: number = 2.0,
): Promise<RenderedPage[]> {
  const { pdf } = await import('pdf-to-img');

  const document = await pdf(pdfBuffer, { scale });

  const results: RenderedPage[] = [];
  let currentPage = 1;

  for await (const image of document) {
    if (pageNumbers.includes(currentPage)) {
      const buffer = Buffer.from(image);
      results.push({
        pageNumber: currentPage,
        buffer,
        width: 0,  // pdf-to-img doesn't expose dimensions directly
        height: 0,
      });
    }
    currentPage++;

    // Early exit if we've rendered all requested pages
    if (results.length === pageNumbers.length) break;
  }

  return results;
}
