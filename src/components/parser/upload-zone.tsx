'use client';

import { useState, useCallback } from 'react';
import { FileUp, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface UploadZoneProps {
  onUploadComplete: (violationId: string) => void;
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile);
    } else {
      toast.error('Please upload a PDF file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.type === 'application/pdf') {
        setFile(selected);
      } else {
        toast.error('Please upload a PDF file');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(10);

    try {
      const supabase = createClient();

      // Generate a unique storage path
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `uploads/${timestamp}_${safeName}`;

      setUploadProgress(30);

      // Upload PDF to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('noi-pdfs')
        .upload(storagePath, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setUploadProgress(60);

      // Trigger the parse API
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfStoragePath: storagePath }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start parse job');
      }

      const { violationId } = await res.json();
      setUploadProgress(100);

      toast.success('NOI PDF uploaded! AI parsing started...');
      onUploadComplete(violationId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : file
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        {file ? (
          <div className="flex items-center gap-3">
            <File className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="ml-4 rounded-full p-1 hover:bg-gray-100"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        ) : (
          <>
            <FileUp className="mb-4 h-12 w-12 text-gray-400" />
            <p className="mb-2 text-lg font-medium text-gray-700">
              Drop your NOI PDF here
            </p>
            <p className="mb-4 text-sm text-gray-500">
              or click to browse files
            </p>
            <label className="cursor-pointer">
              <span className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Choose File
              </span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </>
        )}
      </div>

      {file && (
        <div className="space-y-3">
          {uploading && (
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full"
            size="lg"
          >
            {uploading ? 'Uploading & Starting Parse...' : 'Upload & Parse NOI'}
          </Button>
        </div>
      )}
    </div>
  );
}
