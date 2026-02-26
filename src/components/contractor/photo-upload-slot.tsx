'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Camera, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhotoType } from '@/lib/types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];

interface PhotoUploadSlotProps {
  token: string;
  violationItemId: string;
  photoType: 'BEFORE' | 'AFTER';
  inspectorPhotoId?: string;
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
  existingPhoto,
  onUploadComplete,
}: PhotoUploadSlotProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(existingPhoto?.signed_url || null);
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

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

  const handleClearPhoto = () => {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
        data-testid="photo-input"
      />

      {preview ? (
        // Thumbnail view
        <div className="group relative">
          <img
            src={preview}
            alt={`${photoType} photo`}
            className="h-64 w-full rounded-lg border bg-gray-100 object-contain"
          />

          {/* Overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              Replace
            </Button>
          </div>

          {/* Uploading overlay */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/70">
              <div className="text-center text-white">
                <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <p className="text-sm">Uploading...</p>
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
          className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="h-8 w-8 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">
            Upload {photoType === 'BEFORE' ? 'Before' : 'After'} Photo
          </span>
          <span className="text-xs text-gray-400">Tap to capture or select</span>
        </button>
      )}
    </div>
  );
}
