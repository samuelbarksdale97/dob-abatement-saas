'use client';

import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, ImageOff, Camera, ZoomIn } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

// Configure PDF.js worker via CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface EvidencePhotoProps {
  pdfUrl: string;
  pageNumber: number;
  width?: number;
  description?: string;
}

export function EvidencePhoto({ pdfUrl, pageNumber, width = 280, description }: EvidencePhotoProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxWidth, setLightboxWidth] = useState(700);

  // Measure the dialog container so the PDF page fits without scrolling
  const lightboxRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setLightboxWidth(node.clientWidth);
  }, []);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-lg border bg-gray-50 text-gray-400"
        style={{ width, height: width * 1.3 }}
      >
        <ImageOff className="mb-2 h-8 w-8" />
        <span className="text-xs">Failed to load</span>
      </div>
    );
  }

  return (
    <>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md"
        style={{ width }}
        onClick={() => setLightboxOpen(true)}
      >
        {loading && (
          <div
            className="flex items-center justify-center bg-gray-50"
            style={{ width, height: width * 1.3 }}
          >
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        )}
        {/* Collapse to h-0 while loading so intermediate render states are invisible */}
        <div className={loading ? 'h-0 overflow-hidden' : ''}>
          <Document
            file={pdfUrl}
            onLoadError={() => setError(true)}
            loading={null}
          >
            <Page
              pageNumber={pageNumber}
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onRenderSuccess={() => setLoading(false)}
              onRenderError={() => setError(true)}
            />
          </Document>
        </div>
        {/* Zoom overlay on hover */}
        {!loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
        {!loading && description && (
          <div className="flex items-start gap-1.5 border-t bg-gray-50 px-3 py-2">
            <Camera className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <p className="text-xs leading-tight text-gray-500">{description}</p>
          </div>
        )}
      </div>

      {/* Lightbox dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-h-[90vh] w-[90vw] max-w-3xl overflow-hidden p-4">
          <DialogTitle className="sr-only">Evidence Photo — Page {pageNumber}</DialogTitle>
          <div ref={lightboxRef}>
            <Document file={pdfUrl} loading={null}>
              <Page
                pageNumber={pageNumber}
                width={lightboxWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          </div>
          {description && (
            <div className="flex items-start gap-2">
              <Camera className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p className="text-sm text-gray-600">{description}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
