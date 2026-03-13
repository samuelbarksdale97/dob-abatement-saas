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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center flex flex-col items-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Loading work order...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-slate-50">
        <Card className="max-w-md w-full border-red-100 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-8 text-center bg-red-50/30">
            <h2 className="mb-3 text-2xl font-bold tracking-tight text-red-700">Access Error</h2>
            <p className="text-red-600/80 font-medium">{error || 'Work order not found'}</p>
            <p className="mt-6 text-sm text-red-400/80">
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
    <div className="mx-auto max-w-2xl px-4 py-8 pb-32 sm:px-6 sm:py-12 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 relative">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Badge className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md bg-slate-200 text-slate-800 hover:bg-slate-300">
            {work_order.status.replace('_', ' ')}
          </Badge>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">NOI {violation.notice_id}</span>
        </div>
        <h1 className="mb-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Work Order Assignment</h1>
        <div className="flex items-start gap-2.5 text-slate-600 bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm">
          <MapPin className="h-5 w-5 shrink-0 text-slate-400 mt-0.5" />
          <span className="break-words font-semibold leading-snug">{violation.infraction_address}</span>
        </div>
      </div>

      {/* Key Info Cards */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <Card className="border-slate-200/60 shadow-sm rounded-xl">
          <CardContent className="p-4 sm:p-5 flex flex-col justify-center h-full">
            <p className="mb-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">Deadline</p>
            <p className={`text-xl font-black tracking-tight ${urgencyColor}`}>
              {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm rounded-xl">
          <CardContent className="p-4 sm:p-5 flex flex-col justify-center h-full">
            <p className="mb-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Fines</p>
            <p className="text-xl font-black tracking-tight text-red-600">
              {violation.total_fines ? `$${violation.total_fines.toLocaleString()}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1 border-slate-200/60 shadow-sm rounded-xl">
          <CardContent className="p-4 sm:p-5 flex flex-col justify-center h-full">
            <p className="mb-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">Photos Uploaded</p>
            <p className="text-xl font-black tracking-tight text-slate-900">{uploadedPhotos} / {totalRequiredPhotos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Controls */}
      <div className="mb-8 flex flex-col sm:flex-row gap-3">
        {work_order.status === 'ASSIGNED' && (
          <Button
            onClick={() => handleStatusChange('IN_PROGRESS')}
            disabled={updatingStatus}
            size="lg"
            className="w-full sm:w-auto rounded-xl font-bold text-base h-14 shadow-md bg-slate-900 hover:bg-slate-800"
          >
            <PlayCircle className="mr-2 h-5 w-5" />
            Start Work
          </Button>
        )}
        {work_order.status === 'IN_PROGRESS' && (
          <Button
            onClick={() => handleStatusChange('COMPLETED')}
            disabled={!allPhotosUploaded || updatingStatus}
            size="lg"
            className="w-full sm:w-auto rounded-xl font-bold text-base h-14 shadow-md bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            Mark Complete
          </Button>
        )}
      </div>

      {/* Notes */}
      {work_order.notes && (
        <Card className="mb-8 border-amber-200 bg-amber-50/50 shadow-sm rounded-xl">
          <CardHeader className="pb-3 border-b border-amber-100 p-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-800">Notes from Property Manager</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-900 leading-relaxed italic">"{work_order.notes}"</p>
          </CardContent>
        </Card>
      )}

      {/* Violation Items */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
           <h2 className="text-xl font-black tracking-tight text-slate-900">Required Repairs</h2>
           <span className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-200 px-2.5 py-1 rounded-md">{items.length} Items</span>
        </div>

        {items.map((item) => {
          const inspectors = inspectorsByItem.get(item.id) || [];

          return (
            <Card key={item.id} className="border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/80 border-b border-slate-100 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2 mb-2">
                      <span className="text-slate-400">#{item.item_number}</span>
                      <span className="bg-white border border-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-md uppercase tracking-wider">{item.violation_code}</span>
                    </CardTitle>
                    <p className="text-sm font-medium text-slate-700 leading-snug">{item.violation_description}</p>
                    {item.task_description && (
                      <div className="mt-3 bg-blue-50 border border-blue-100 p-3 rounded-lg">
                        <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-0.5">Required Fix</p>
                        <p className="text-sm font-medium text-blue-900">{item.task_description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-6 bg-white">
                {inspectors.length > 0 && pdf_url ? (
                  // 1:1 before/after pairs for each inspector photo
                  inspectors.map((inspectorPhoto, idx) => {
                    const existingAfter = afterByInspector.get(inspectorPhoto.id);
                    const description = (inspectorPhoto.metadata as Record<string, string>)?.description;

                    return (
                      <div key={inspectorPhoto.id} className="last:mb-0 mb-6 pb-6 last:pb-0 last:border-0 border-b border-slate-100">
                        {inspectors.length > 1 && (
                          <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50 inline-flex px-2 py-1 rounded">
                            Repair Area {idx + 1} of {inspectors.length}
                            {description && <span className="ml-1 text-slate-500 font-medium normal-case tracking-normal">— {description}</span>}
                          </p>
                        )}
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                          {/* Left: Before (Inspector) */}
                          <div className="flex flex-col">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                              <Camera className="h-3 w-3" />
                              Original Infraction (Before)
                            </p>
                            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                               <EvidencePhoto
                                 pdfUrl={pdf_url}
                                 pageNumber={inspectorPhoto.page_number!}
                                 width={200}
                               />
                            </div>
                          </div>
                          {/* Right: After (Upload) */}
                          <div className="flex flex-col">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center justify-between">
                              <span>Completed Repair (After) <span className="text-red-500">*</span></span>
                            </p>
                            <div className="flex-1">
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
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // No inspector photos — show single upload slot
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600 text-center">
                      Upload Repair Photo <span className="text-red-500">*</span>
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
        <div className="mt-8 border border-emerald-200 bg-emerald-50 rounded-xl p-5 shadow-sm transform transition-all duration-300 translate-y-0 opacity-100">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-full shrink-0">
               <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
               <p className="font-bold text-emerald-900 tracking-tight">All required photos uploaded!</p>
               <p className="text-sm text-emerald-700 mt-0.5">Please scroll up and mark this work order as complete.</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>For questions, contact the property manager.</p>
      </div>
    </div>
  );
}
