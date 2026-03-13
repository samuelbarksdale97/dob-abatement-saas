'use client';

import { useState, useCallback } from 'react';
import { FileUp, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={cn(
          "group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-all duration-300",
          dragOver
            ? "border-blue-400 bg-blue-50/80 scale-[1.02] shadow-lg shadow-blue-100/50"
            : file
            ? "border-emerald-300 bg-emerald-50/50"
            : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-100/50 hover:shadow-sm"
        )}
      >
        {file ? (
          <div className="flex items-center gap-4 bg-white p-4 pr-5 rounded-xl border border-emerald-100 shadow-sm transition-all">
            <div className="bg-emerald-100 p-2.5 rounded-lg shrink-0">
               <File className="h-7 w-7 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 tracking-tight truncate">{file.name}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="ml-2 rounded-full p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white p-4 rounded-full shadow-sm mb-5 group-hover:-translate-y-1 transition-transform duration-300">
               <FileUp className="h-10 w-10 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <p className="mb-2 text-xl font-bold tracking-tight text-slate-800">
              Drag & Drop your NOI PDF here
            </p>
            <p className="mb-6 text-sm font-medium text-slate-500">
              or click below to browse your files
            </p>
            <label className="cursor-pointer">
              <span className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all focus:ring-2 focus:ring-slate-300 inline-block">
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
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                 <span>{uploadProgress < 100 ? 'Uploading & Parsing...' : 'Processing Complete'}</span>
                 <span>{uploadProgress}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 border border-slate-200/60 shadow-inner">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-700 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full h-14 rounded-xl text-base font-bold shadow-md hover:scale-[1.02] transition-all bg-slate-900 hover:bg-slate-800 disabled:hover:scale-100"
            size="lg"
          >
            {uploading ? 'Processing NOI Document...' : 'Upload & Parse NOI'}
          </Button>
        </div>
      )}
    </div>
  );
}
