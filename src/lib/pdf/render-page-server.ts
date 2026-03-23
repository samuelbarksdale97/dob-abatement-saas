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

  // Use getPage() to jump directly to specific pages instead of
  // iterating through every page in the PDF sequentially
  for (const pageNumber of pageNumbers) {
    if (pageNumber < 1 || pageNumber > document.length) continue;

    try {
      const buffer = await document.getPage(pageNumber);
      results.push({
        pageNumber,
        buffer,
        width: 0,
        height: 0,
      });
    } catch (err) {
      console.error(`Failed to render page ${pageNumber}:`, err);
    }
  }

  return results;
}
