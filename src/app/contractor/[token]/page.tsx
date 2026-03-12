'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { MapPin, Calendar, DollarSign, CheckCircle2, PlayCircle, Camera } from 'lucide-react';
import { PhotoUploadSlot } from '@/components/contractor/photo-upload-slot';
import type { WorkOrder, Violation, ViolationItem, Photo } from '@/lib/types';
import dynamic from 'next/dynamic';

const EvidencePhoto = dynamic(() => import('@/components/parser/evidence-photo').then(m => m.EvidencePhoto), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] w-[160px] items-center justify-center rounded-lg border bg-gray-50">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    </div>
  ),
});

interface ContractorViewData {
  work_order: WorkOrder;
  violation: Violation;
  items: ViolationItem[];
  photos: Photo[];
  pdf_url: string | null;
}

export default function ContractorViewPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<ContractorViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/contractor/${token}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load work order');
      }

      setData(result);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch contractor data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load work order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleStatusChange = async (newStatus: 'IN_PROGRESS' | 'COMPLETED') => {
    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/contractor/${token}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update status');
      }

      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
      await fetchData(); // Refresh data
    } catch (err) {
      console.error('Status update error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-600">Loading work order...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="mb-2 text-xl font-semibold text-red-600">Access Error</h2>
            <p className="text-gray-600">{error || 'Work order not found'}</p>
            <p className="mt-4 text-sm text-gray-500">
              Please contact the property manager if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Optimistically merge a newly uploaded photo into state without full refetch.
  // This avoids re-mounting EvidencePhoto components (PDF renders) which causes
  // the jarring disappear/reappear flash.
  const handlePhotoUploaded = (newPhoto: {
    id: string;
    violation_item_id: string;
    photo_type: string;
    signed_url: string;
    inspector_photo_id?: string;
  }) => {
    setData((prev) => {
      if (!prev) return prev;
      // Remove any existing photo for this item+type+inspector combo
      const filtered = prev.photos.filter((p) => {
        if (p.violation_item_id !== newPhoto.violation_item_id || p.photo_type !== newPhoto.photo_type) return true;
        // If inspector_photo_id is set, only remove the matching one
        if (newPhoto.inspector_photo_id) {
          const pInspId = (p.metadata as Record<string, unknown>)?.inspector_photo_id;
          return pInspId !== newPhoto.inspector_photo_id;
        }
        return false;
      });
      const now = new Date().toISOString();
      const mergedPhoto: Photo & { signed_url: string } = {
        id: newPhoto.id,
        org_id: prev.violation.org_id,
        violation_id: prev.violation.id,
        violation_item_id: newPhoto.violation_item_id,
        photo_type: newPhoto.photo_type as Photo['photo_type'],
        storage_path: '',
        file_name: null,
        file_size: null,
        mime_type: 'image/jpeg',
        page_number: null,
        matched_violation_code: null,
        status: 'PENDING_REVIEW',
        approved_by: null,
        approved_at: null,
        rejection_reason: null,
        taken_at: null,
        metadata: newPhoto.inspector_photo_id ? { inspector_photo_id: newPhoto.inspector_photo_id } : {},
        created_at: now,
        updated_at: now,
        signed_url: newPhoto.signed_url,
      };
      return {
        ...prev,
        photos: [...filtered, mergedPhoto],
      };
    });
  };

  const { work_order, violation, items, photos, pdf_url } = data;

  // Group INSPECTOR photos by item
  const inspectorsByItem = new Map<string, Photo[]>();
  for (const item of items) {
    inspectorsByItem.set(item.id, []);
  }

  // Index AFTER photos by inspector_photo_id for 1:1 pairing
  const afterByInspector = new Map<string, Photo & { signed_url?: string }>();

  for (const photo of photos) {
    if (!photo.violation_item_id) continue;

    if (photo.photo_type === 'INSPECTOR') {
      const list = inspectorsByItem.get(photo.violation_item_id);
      if (list) list.push(photo);
    } else if (photo.photo_type === 'AFTER') {
      const inspId = (photo.metadata as Record<string, unknown>)?.inspector_photo_id as string | undefined;
      if (inspId) {
        afterByInspector.set(inspId, photo as Photo & { signed_url?: string });
      }
    }
  }

  // Calculate completion: one AFTER required per INSPECTOR photo
  let totalRequiredPhotos = 0;
  let uploadedPhotos = 0;
  for (const inspectors of inspectorsByItem.values()) {
    totalRequiredPhotos += Math.max(inspectors.length, 1); // At least 1 per item
    for (const ip of inspectors) {
      if (afterByInspector.has(ip.id)) uploadedPhotos++;
    }
    if (inspectors.length === 0) {
      // Item with no inspector photos — not counted as uploaded
    }
  }
  const allPhotosUploaded = uploadedPhotos === totalRequiredPhotos && totalRequiredPhotos > 0;

  // Deadline urgency
  const daysLeft = violation.abatement_deadline
    ? Math.ceil((new Date(violation.abatement_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const urgencyColor =
    daysLeft === null ? 'text-gray-600' : daysLeft < 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-orange-600' : 'text-green-600';

  return (
    <div className="mx-auto max-w-4xl p-4 pb-20 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Badge className="text-sm">{work_order.status.replace('_', ' ')}</Badge>
          <span className="text-sm text-gray-500">NOI {violation.notice_id}</span>
        </div>
        <h1 className="mb-2 text-xl font-bold text-gray-900 sm:text-3xl">Work Order Assignment</h1>
        <div className="flex items-center gap-2 text-gray-600">
          <MapPin className="h-5 w-5 shrink-0" />
          <span className="break-words font-medium">{violation.infraction_address}</span>
        </div>
      </div>

      {/* Key Info Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="mb-1 text-xs text-gray-500">Deadline</p>
            <p className={`text-lg font-semibold ${urgencyColor}`}>
              {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="mb-1 text-xs text-gray-500">Total Fines</p>
            <p className="text-lg font-semibold text-red-600">
              {violation.total_fines ? `$${violation.total_fines.toLocaleString()}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <p className="mb-1 text-xs text-gray-500">Photos Uploaded</p>
            <p className="text-lg font-semibold">{uploadedPhotos} / {totalRequiredPhotos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Controls */}
      <div className="mb-6 flex gap-2">
        {work_order.status === 'ASSIGNED' && (
          <Button
            onClick={() => handleStatusChange('IN_PROGRESS')}
            disabled={updatingStatus}
            className="min-h-[44px] min-w-[44px]"
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            Start Work
          </Button>
        )}
        {work_order.status === 'IN_PROGRESS' && (
          <Button
            onClick={() => handleStatusChange('COMPLETED')}
            disabled={!allPhotosUploaded || updatingStatus}
            className="min-h-[44px] min-w-[44px]"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark Complete
          </Button>
        )}
      </div>

      {/* Notes */}
      {work_order.notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Notes from Property Manager</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{work_order.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Violation Items */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Violation Items ({items.length})</h2>

        {items.map((item) => {
          const inspectors = inspectorsByItem.get(item.id) || [];

          return (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      Item #{item.item_number} — {item.violation_code}
                    </CardTitle>
                    <p className="mt-1 text-sm text-gray-600">{item.violation_description}</p>
                    {item.task_description && (
                      <p className="mt-2 text-sm font-medium text-blue-700">
                        Fix: {item.task_description}
                      </p>
                    )}
                  </div>
                  {item.fine && (
                    <span className="text-lg font-semibold text-red-600">
                      ${item.fine.toLocaleString()}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {inspectors.length > 0 && pdf_url ? (
                  // 1:1 before/after pairs for each inspector photo
                  inspectors.map((inspectorPhoto, idx) => {
                    const existingAfter = afterByInspector.get(inspectorPhoto.id);
                    const description = (inspectorPhoto.metadata as Record<string, string>)?.description;

                    return (
                      <div key={inspectorPhoto.id}>
                        {inspectors.length > 1 && (
                          <p className="mb-2 text-xs font-medium text-gray-500">
                            Photo {idx + 1} of {inspectors.length}
                            {description && <span className="ml-1 font-normal">— {description}</span>}
                          </p>
                        )}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {/* Left: Before (Inspector) */}
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-500">
                              <Camera className="mr-1 inline h-3 w-3" />
                              Before
                            </p>
                            <EvidencePhoto
                              pdfUrl={pdf_url}
                              pageNumber={inspectorPhoto.page_number!}
                              width={200}
                            />
                          </div>
                          {/* Right: After (Upload) */}
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-500">
                              After <span className="text-red-500">*</span>
                            </p>
                            <PhotoUploadSlot
                              token={token}
                              violationItemId={item.id}
                              photoType="AFTER"
                              inspectorPhotoId={inspectorPhoto.id}
                              pdfUrl={pdf_url ?? undefined}
                              inspectorPageNumber={inspectorPhoto.page_number ?? undefined}
                              existingPhoto={
                                existingAfter && (existingAfter as any).signed_url
                                  ? { id: existingAfter.id, signed_url: (existingAfter as any).signed_url }
                                  : undefined
                              }
                              onUploadComplete={handlePhotoUploaded}
                            />
                          </div>
                        </div>
                        {idx < inspectors.length - 1 && <Separator className="my-4" />}
                      </div>
                    );
                  })
                ) : (
                  // No inspector photos — show single upload slot
                  <div>
                    <p className="mb-3 text-sm font-medium text-gray-700">
                      After Photo (Repair Complete) <span className="text-red-500">*</span>
                    </p>
                    <PhotoUploadSlot
                      token={token}
                      violationItemId={item.id}
                      photoType="AFTER"
                      onUploadComplete={handlePhotoUploaded}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Completion Message */}
      {allPhotosUploaded && (
        <Card className="mt-6 border-green-500 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="font-medium text-green-900">
                All photos uploaded! You can now mark this work order as complete.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>For questions, contact the property manager.</p>
      </div>
    </div>
  );
}
