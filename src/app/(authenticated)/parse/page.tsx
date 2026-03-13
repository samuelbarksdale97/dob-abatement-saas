'use client';

import { useState, useCallback } from 'react';
import { Nav } from '@/components/layout/nav';
import { UploadZone } from '@/components/parser/upload-zone';
import { ParseProgress } from '@/components/parser/parse-progress';
import { ParsedResults } from '@/components/parser/parsed-results';

type ParseState = 'upload' | 'processing' | 'results';

export default function ParsePage() {
  const [state, setState] = useState<ParseState>('upload');
  const [violationId, setViolationId] = useState<string | null>(null);

  const handleUploadComplete = (id: string) => {
    setViolationId(id);
    setState('processing');
  };

  const handleParseComplete = useCallback(() => {
    setState('results');
  }, []);

  return (
    <div>
      <Nav title="Parse NOI PDF" />
      <div className="mx-auto max-w-3xl p-6 sm:p-10">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-black tracking-tight text-slate-900">Upload NOI Document</h2>
          <p className="mt-2 text-base font-medium text-slate-500 max-w-xl mx-auto">
            Upload a Notice of Infraction PDF and our AI will extract all violation data automatically.
          </p>
        </div>

        {state === 'upload' && (
          <UploadZone onUploadComplete={handleUploadComplete} />
        )}

        {state === 'processing' && violationId && (
          <ParseProgress
            violationId={violationId}
            onComplete={handleParseComplete}
          />
        )}

        {state === 'results' && violationId && (
          <ParsedResults violationId={violationId} />
        )}
      </div>
    </div>
  );
}
