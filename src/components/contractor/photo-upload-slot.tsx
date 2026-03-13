'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Camera, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];

interface VerificationResult {
  isMatch: boolean;
  confidence: number;
  reasoning: string;
  details: string;
  photo_id: string;
}

interface PhotoUploadSlotProps {
  token: string;
  violationItemId: string;
  photoType: 'BEFORE' | 'AFTER';
  inspectorPhotoId?: string;
  pdfUrl?: string;
  inspectorPageNumber?: number;
  existingPhoto?: {
    id: string;
    signed_url: string;
  };
  onUploadComplete: (newPhoto: { id: string; violation_item_id: string; photo_type: string; signed_url: string; inspector_photo_id?: string }) => void;
}

export function PhotoUploadSlot({
  token,
  violationItemId,
  photoType,
  inspectorPhotoId,
  pdfUrl,
  inspectorPageNumber,
  existingPhoto,
  onUploadComplete,
}: PhotoUploadSlotProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(existingPhoto?.signed_url || null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return 'File must be under 10MB';
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Only image files are allowed (JPEG, PNG, HEIC, WebP)';
    }

    return null;
  };

  const runVerification = async (photoId: string) => {
    if (!pdfUrl || !inspectorPageNumber) return;

    setVerifying(true);
    try {
      // Render the inspector PDF page to a data URL client-side
      const { renderPdfPageToImage } = await import('@/lib/pdf/prepare-images');
      const inspectorDataUrl = await renderPdfPageToImage(pdfUrl, inspectorPageNumber, 1.5);

      // Call verification API
      const verifyResponse = await fetch(`/api/contractor/${token}/photos/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_id: photoId,
          inspector_image_data: inspectorDataUrl,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (verifyResponse.ok && verifyData.verification) {
        setVerificationResult(verifyData.verification);
        if (verifyData.verification.isMatch && verifyData.verification.confidence >= 80) {
          toast.success(`Angle verified (${verifyData.verification.confidence}% match)`);
        } else {
          toast.warning('Angle mismatch — consider retaking from the same position as the inspector photo');
        }
      }
    } catch (err) {
      console.error('Verification error:', err);
      toast.info('Photo uploaded. Angle verification unavailable.');
    } finally {
      setVerifying(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    // Clear previous verification
    setVerificationResult(null);

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setUploading(true);

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('violation_item_id', violationItemId);
      formData.append('photo_type', photoType);
      if (inspectorPhotoId) {
        formData.append('inspector_photo_id', inspectorPhotoId);
      }

      // Upload
      const response = await fetch(`/api/contractor/${token}/photos`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Update preview with signed URL from server
      if (data.signed_url) {
        URL.revokeObjectURL(previewUrl);
        setPreview(data.signed_url);
      }

      toast.success(`${photoType === 'BEFORE' ? 'Before' : 'After'} photo uploaded successfully`);
      onUploadComplete({
        id: data.photo?.id || crypto.randomUUID(),
        violation_item_id: violationItemId,
        photo_type: photoType,
        signed_url: data.signed_url,
        inspector_photo_id: inspectorPhotoId,
      });

      // Trigger angle verification for AFTER photos with inspector pairing
      if (photoType === 'AFTER' && pdfUrl && inspectorPageNumber && data.photo?.id) {
        runVerification(data.photo.id);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload photo');
      // Revert preview on error
      URL.revokeObjectURL(previewUrl);
      setPreview(existingPhoto?.signed_url || null);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isVerified = verificationResult?.isMatch && verificationResult.confidence >= 80;

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading || verifying}
        data-testid="photo-input"
      />

      {preview ? (
        // Thumbnail view
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm">
          <img
            src={preview}
            alt={`${photoType} photo`}
            className="h-56 w-full bg-slate-100 object-cover"
          />

          {/* Overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 transition-all duration-300 group-hover:opacity-100">
            <Button
              size="sm"
              variant="secondary"
              className="rounded-xl font-semibold shadow-sm backdrop-blur-md bg-white/90 hover:bg-white text-slate-800"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || verifying}
            >
              <Upload className="mr-2 h-4 w-4" />
              Replace Photo
            </Button>
          </div>

          {/* Uploading overlay */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
              <div className="text-center text-white flex flex-col items-center">
                <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="text-xs font-bold uppercase tracking-wider">Uploading...</p>
              </div>
            </div>
          )}

          {/* Verifying overlay */}
          {verifying && !uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
              <div className="text-center text-white flex flex-col items-center">
                <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="text-xs font-bold uppercase tracking-wider">Verifying Match...</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Upload button
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="group flex h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-400 transition-all disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="bg-white p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform duration-300">
             <Camera className="h-6 w-6 text-slate-400 shrink-0 group-hover:text-slate-600 transition-colors" />
          </div>
          <div className="flex flex-col items-center gap-1">
             <span className="text-sm font-bold text-slate-700">
               Upload {photoType === 'BEFORE' ? 'Before' : 'After'} Photo
             </span>
             <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tap to capture or select</span>
          </div>
        </button>
      )}

      {/* Verification result badge */}
      {verificationResult && !verifying && (
        <div className={`mt-3 rounded-xl border p-3 border-l-4 shadow-sm ${
          isVerified
            ? 'border-emerald-200 border-l-emerald-500 bg-emerald-50/50'
            : 'border-amber-200 border-l-amber-500 bg-amber-50/50'
        }`}>
          <div className="flex items-center gap-2">
            {isVerified
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            }
            <span className={cn("text-xs font-bold uppercase tracking-wider", isVerified ? "text-emerald-800" : "text-amber-800")}>
              {isVerified
                ? `Angle Match (${Math.round(verificationResult.confidence)}%)`
                : `Angle Mismatch (${Math.round(verificationResult.confidence)}%)`
              }
            </span>
          </div>
          <p className={cn("mt-1.5 text-xs font-medium leading-relaxed", isVerified ? "text-emerald-700/90" : "text-amber-700/90")}>{verificationResult.reasoning}</p>
        </div>
      )}
    </div>
  );
}
