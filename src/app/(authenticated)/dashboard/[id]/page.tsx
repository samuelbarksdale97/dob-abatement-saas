'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  User,
  Camera,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Violation, ViolationItem, Photo, AuditLogEntry, WorkOrder } from '@/lib/types';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  getPriorityColor,
  getPriorityLabel,
  getDaysRemaining,
  getUrgencyColor,
  getNextStatuses,
} from '@/lib/status-transitions';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { AssignWorkOrderDialog } from '@/components/contractor/assign-work-order-dialog';

const EvidencePhoto = dynamic(() => import('@/components/parser/evidence-photo').then(m => m.EvidencePhoto), {
  ssr: false,
  loading: () => (
    <div className="flex h-[312px] w-[240px] items-center justify-center rounded-lg border bg-gray-50">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    </div>
  ),
});

const GeneratePdfButton = dynamic(
  () => import('@/components/submission/generate-pdf-button').then(m => m.GeneratePdfButton),
  { ssr: false },
);

export default function ViolationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [violation, setViolation] = useState<Violation | null>(null);
  const [items, setItems] = useState<ViolationItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [contractorToken, setContractorToken] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      const [violationRes, itemsRes, photosRes, auditRes, workOrderRes] = await Promise.all([
        supabase.from('violations').select('*').eq('id', id).single(),
        supabase.from('violation_items').select('*').eq('violation_id', id).order('item_number'),
        supabase.from('photos').select('*').eq('violation_id', id).order('page_number'),
        supabase.from('audit_log').select('*').eq('record_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('work_orders').select('*').eq('violation_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (violationRes.data) {
        setViolation(violationRes.data as Violation);
        // Generate signed URL for the PDF
        if (violationRes.data.pdf_storage_path) {
          const { data: urlData } = await supabase.storage
            .from('noi-pdfs')
            .createSignedUrl(violationRes.data.pdf_storage_path, 3600);
          if (urlData?.signedUrl) setPdfUrl(urlData.signedUrl);
        }
      }
      if (itemsRes.data) setItems(itemsRes.data as ViolationItem[]);
      if (photosRes.data) {
        // Generate signed URLs for AFTER photos (contractor uploads)
        const photosWithUrls = await Promise.all(
          (photosRes.data as Photo[]).map(async (photo) => {
            if (photo.photo_type === 'AFTER' && photo.storage_path) {
              const { data: urlData } = await supabase.storage
                .from('contractor-photos')
                .createSignedUrl(photo.storage_path, 3600);

              return {
                ...photo,
                signed_url: urlData?.signedUrl || null,
              } as any;
            }
            return photo;
          })
        );
        setPhotos(photosWithUrls);
      }
      if (auditRes.data) setAuditLog(auditRes.data as AuditLogEntry[]);
      if (workOrderRes.data) {
        setWorkOrder(workOrderRes.data as WorkOrder);

        // Fetch contractor token if work order exists
        const tokenRes = await supabase
          .from('contractor_tokens')
          .select('token')
          .eq('work_order_id', workOrderRes.data.id)
          .is('revoked_at', null)
          .maybeSingle();

        if (tokenRes.data) {
          setContractorToken(tokenRes.data.token);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const handleAssignSuccess = async () => {
    // Refetch work order, violation, and contractor token
    const supabase = createClient();
    const [workOrderRes, violationRes] = await Promise.all([
      supabase.from('work_orders').select('*').eq('violation_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('violations').select('*').eq('id', id).single(),
    ]);

    if (workOrderRes.data) {
      setWorkOrder(workOrderRes.data as WorkOrder);

      // Fetch contractor token
      const tokenRes = await supabase
        .from('contractor_tokens')
        .select('token')
        .eq('work_order_id', workOrderRes.data.id)
        .is('revoked_at', null)
        .maybeSingle();

      if (tokenRes.data) {
        setContractorToken(tokenRes.data.token);
      }
    }

    if (violationRes.data) setViolation(violationRes.data as Violation);
  };

  // Group photos by violation_item_id for the Items tab
  const photosByItem = new Map<string, Photo[]>();
  const unmatchedPhotos: Photo[] = [];
  for (const photo of photos) {
    if (photo.violation_item_id) {
      const existing = photosByItem.get(photo.violation_item_id) || [];
      existing.push(photo);
      photosByItem.set(photo.violation_item_id, existing);
    } else {
      unmatchedPhotos.push(photo);
    }
  }

  // Compute contractor repair progress (INSPECTOR photos with matching AFTER photos)
  const inspectorPhotos = photos.filter(p => p.photo_type === 'INSPECTOR');
  const afterPhotos = photos.filter(p => p.photo_type === 'AFTER');
  const afterInspectorIds = new Set(
    afterPhotos
      .map(p => (p.metadata as Record<string, unknown>)?.inspector_photo_id as string | undefined)
      .filter(Boolean),
  );
  // Track which items have at least one completed photo pair
  const completedItemIds = new Set<string>();
  // Count total required and completed
  const totalInspectorPhotos = inspectorPhotos.length || items.length; // fallback to items if no inspectors
  const completedInspectorPhotos = inspectorPhotos.length > 0
    ? inspectorPhotos.filter(ip => afterInspectorIds.has(ip.id)).length
    : afterPhotos.length; // legacy: count any AFTER photos
  for (const [itemId, itemPhotos] of photosByItem.entries()) {
    const itemInspectors = itemPhotos.filter(p => p.photo_type === 'INSPECTOR');
    const allDone = itemInspectors.length > 0
      ? itemInspectors.every(ip => afterInspectorIds.has(ip.id))
      : itemPhotos.some(p => p.photo_type === 'AFTER');
    if (allDone && itemInspectors.length > 0) completedItemIds.add(itemId);
    else if (allDone && itemPhotos.some(p => p.photo_type === 'AFTER')) completedItemIds.add(itemId);
  }
  const progressPercent = totalInspectorPhotos > 0 ? Math.round((completedInspectorPhotos / totalInspectorPhotos) * 100) : 0;

  const handleStatusChange = async (newStatus: string) => {
    const res = await fetch('/api/violations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    });

    if (res.ok) {
      const updated = await res.json();
      setViolation(updated as Violation);
      toast.success(`Status updated to ${STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS]}`);
    } else {
      toast.error('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div>
        <Nav title="Violation Detail" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!violation) {
    return (
      <div>
        <Nav title="Violation Detail" />
        <div className="p-6 text-center text-gray-500">Violation not found.</div>
      </div>
    );
  }

  const daysLeft = getDaysRemaining(violation.abatement_deadline);
  const urgencyColor = getUrgencyColor(violation.abatement_deadline, violation.status);
  const nextStatuses = getNextStatuses(violation.status);

  return (
    <div>
      <Nav title={`Violation ${violation.notice_id || 'Detail'}`} />
      <div className="p-6">
        {/* Back button + header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="mb-3"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-semibold">
                {violation.notice_id || 'Pending NOI'}
              </h2>
              <p className="mt-1 flex items-center gap-1 text-gray-500">
                <MapPin className="h-4 w-4" />
                {violation.infraction_address || 'Address pending'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={STATUS_COLORS[violation.status]}>
                {STATUS_LABELS[violation.status]}
              </Badge>
              <span className={`rounded px-2 py-1 text-sm font-medium ${getPriorityColor(violation.priority)}`}>
                {getPriorityLabel(violation.priority)}
              </span>
            </div>
          </div>
        </div>

        {/* Key metrics */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Total Fines</p>
              <p className="text-lg font-semibold text-red-600">
                {violation.total_fines ? `$${violation.total_fines.toLocaleString()}` : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Deadline</p>
              <p className={`text-lg font-semibold ${urgencyColor}`}>
                {daysLeft !== null
                  ? daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`
                  : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Violation Items</p>
              <p className="text-lg font-semibold">{items.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Photos</p>
              <p className="text-lg font-semibold">{photos.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">Respondent</p>
              <p className="text-sm font-medium truncate">{violation.respondent || '—'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Work Order Section */}
        {workOrder && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Assigned Contractor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Name</p>
                  <p className="font-medium">{workOrder.contractor_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Email</p>
                  <p className="font-medium">{workOrder.contractor_email}</p>
                </div>
                <div>
                  <p className="text-gray-500">Phone</p>
                  <p className="font-medium">{workOrder.contractor_phone || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <Badge className="mt-1">{workOrder.status}</Badge>
                </div>
                <div>
                  <p className="text-gray-500">Due Date</p>
                  <p className="font-medium">{workOrder.due_date ? new Date(workOrder.due_date).toLocaleDateString() : '—'}</p>
                </div>
                {workOrder.completed_at && (
                  <div>
                    <p className="text-gray-500">Completed</p>
                    <p className="font-medium">{new Date(workOrder.completed_at).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {/* Repair Progress */}
              {items.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">Repair Progress</p>
                    <p className="text-sm text-gray-500">
                      {completedInspectorPhotos} of {totalInspectorPhotos} photos
                    </p>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {items.map((item) => {
                      const done = completedItemIds.has(item.id);
                      return (
                        <span
                          key={item.id}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          #{item.item_number}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {workOrder.notes && (
                <div className="mt-3 border-t pt-3">
                  <p className="text-gray-500 text-sm">Notes</p>
                  <p className="text-sm">{workOrder.notes}</p>
                </div>
              )}
              {contractorToken && (
                <div className="mt-3 border-t pt-3">
                  <p className="text-gray-500 text-sm mb-2">Contractor Access Link</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-gray-100 px-3 py-2 text-xs break-all">
                      {process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/contractor/{contractorToken}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/contractor/${contractorToken}`;
                        navigator.clipboard.writeText(link);
                        toast.success('Link copied to clipboard');
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Status actions */}
        <div className="mb-6 flex gap-2">
          {/* Assign Contractor button (only show if status allows and no work order) */}
          {!workOrder && ['PARSED', 'ASSIGNED', 'IN_PROGRESS'].includes(violation.status) && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setAssignDialogOpen(true)}
            >
              <User className="mr-2 h-4 w-4" />
              Assign Contractor
            </Button>
          )}

          {nextStatuses.length > 0 && nextStatuses.map((status) => (
            <Button
              key={status}
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange(status)}
            >
              Move to {STATUS_LABELS[status]}
            </Button>
          ))}

          {/* Generate Submission PDF */}
          {['PHOTOS_UPLOADED', 'READY_FOR_SUBMISSION', 'SUBMITTED'].includes(violation.status) && (
            <GeneratePdfButton
              violation={violation}
              items={items}
              photos={photos}
              pdfUrl={pdfUrl}
            />
          )}
        </div>

        {/* Tabbed content */}
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
            <TabsTrigger value="photos">Photos ({photos.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="mt-4 space-y-3">
            {items.map((item) => {
              const itemPhotos = photosByItem.get(item.id) || [];
              return (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-500">#{item.item_number}</span>
                          <Badge variant="outline" className="text-xs">{item.violation_code}</Badge>
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${getPriorityColor(item.priority)}`}>
                            P{item.priority}
                          </span>
                          {itemPhotos.length > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-gray-400">
                              <Camera className="h-3 w-3" />
                              {itemPhotos.length}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{item.violation_description}</p>
                        {item.task_description && (
                          <p className="mt-1 text-sm text-blue-700">
                            <span className="font-medium">Fix: </span>{item.task_description}
                          </p>
                        )}
                        <div className="mt-2 flex gap-4 text-xs text-gray-400">
                          <span>Location: {item.specific_location || '—'}</span>
                          <span>Floor: {item.floor_number || '—'}</span>
                          <span>Deadline: {item.abatement_deadline || '—'}</span>
                        </div>
                      </div>
                      <p className="ml-4 font-semibold text-red-600">
                        {item.fine ? `$${item.fine.toLocaleString()}` : '—'}
                      </p>
                    </div>

                    {/* Linked evidence photos */}
                    {itemPhotos.length > 0 && (
                      <div className="mt-4 border-t pt-4">
                        {/* Inspector Photos (BEFORE) */}
                        {itemPhotos.filter(p => p.photo_type === 'INSPECTOR' && p.page_number).length > 0 && pdfUrl && (
                          <div className="mb-4">
                            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                              <Camera className="h-3.5 w-3.5" />
                              Before (Inspector) — Page {itemPhotos.filter(p => p.photo_type === 'INSPECTOR').map(p => p.page_number).join(', ')}
                            </p>
                            <div className="flex flex-wrap gap-3">
                              {itemPhotos.filter(p => p.photo_type === 'INSPECTOR').map((photo) => (
                                <EvidencePhoto
                                  key={photo.id}
                                  pdfUrl={pdfUrl}
                                  pageNumber={photo.page_number!}
                                  width={240}
                                  description={
                                    (photo.metadata as Record<string, string>)?.description || undefined
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AFTER Photos (Contractor Uploads) */}
                        {itemPhotos.filter(p => p.photo_type === 'AFTER').length > 0 && (
                          <div>
                            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-green-700">
                              <Camera className="h-3.5 w-3.5" />
                              After (Repair Complete) ✓
                            </p>
                            <div className="flex flex-wrap gap-3">
                              {itemPhotos.filter(p => p.photo_type === 'AFTER').map((photo) => {
                                const photoAny = photo as any;
                                const signedUrl = photoAny.signed_url;

                                console.log('AFTER photo:', { id: photo.id, storage_path: photo.storage_path, signedUrl });

                                return (
                                  <div key={photo.id} className="relative group">
                                    {signedUrl ? (
                                      <img
                                        src={signedUrl}
                                        alt="After photo - repair completed"
                                        className="h-60 w-auto rounded-lg border object-cover shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                                        onClick={() => setLightboxPhoto(signedUrl)}
                                        onError={(e) => {
                                          console.error('Image load error:', signedUrl);
                                          const target = e.currentTarget;
                                          target.style.display = 'none';
                                          const errorDiv = document.createElement('div');
                                          errorDiv.className = 'flex h-60 w-60 items-center justify-center rounded-lg border bg-red-50 p-4';
                                          errorDiv.innerHTML = '<p class="text-xs text-red-600 text-center">Failed to load image</p>';
                                          target.parentElement?.appendChild(errorDiv);
                                        }}
                                      />
                                    ) : (
                                      <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-lg border bg-gray-50 p-4">
                                        <Camera className="h-8 w-8 text-gray-400" />
                                        <p className="text-center text-xs text-gray-600">
                                          Photo uploaded
                                        </p>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={async () => {
                                            const supabase = createClient();
                                            console.log('Fetching signed URL for:', photo.storage_path);
                                            const { data, error } = await supabase.storage
                                              .from('contractor-photos')
                                              .createSignedUrl(photo.storage_path, 3600);

                                            console.log('Signed URL result:', { data, error });

                                            if (error) {
                                              toast.error(`Failed to load photo: ${error.message}`);
                                              return;
                                            }

                                            if (data?.signedUrl) {
                                              window.open(data.signedUrl, '_blank');
                                            } else {
                                              toast.error('No signed URL returned');
                                            }
                                          }}
                                        >
                                          View Photo
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {items.length === 0 && (
              <p className="py-8 text-center text-gray-500">No violation items found.</p>
            )}
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            {photos.length > 0 && pdfUrl ? (
              <div className="space-y-6">
                {/* Matched photos grouped by violation code */}
                {Array.from(photosByItem.entries()).map(([itemId, itemPhotos]) => {
                  const item = items.find(i => i.id === itemId);
                  return (
                    <div key={itemId}>
                      <p className="mb-3 text-sm font-medium text-gray-700">
                        #{item?.item_number} — {itemPhotos[0]?.matched_violation_code || 'Unknown Code'}
                      </p>
                      <div className="flex flex-wrap gap-4">
                        {itemPhotos.map((photo) => (
                          <EvidencePhoto
                            key={photo.id}
                            pdfUrl={pdfUrl}
                            pageNumber={photo.page_number!}
                            width={280}
                            description={
                              (photo.metadata as Record<string, string>)?.description || undefined
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Unmatched photos */}
                {unmatchedPhotos.length > 0 && (
                  <div>
                    <p className="mb-3 text-sm font-medium text-gray-500">
                      Unmatched Evidence Photos
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {unmatchedPhotos.map((photo) => (
                        <EvidencePhoto
                          key={photo.id}
                          pdfUrl={pdfUrl}
                          pageNumber={photo.page_number!}
                          width={280}
                          description={
                            (photo.metadata as Record<string, string>)?.description || undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : photos.length > 0 ? (
              <div className="py-8 text-center text-gray-500">
                <p>PDF not available for rendering photos.</p>
              </div>
            ) : (
              <p className="py-8 text-center text-gray-500">No photos yet.</p>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            {auditLog.length > 0 ? (
              <div className="space-y-3">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <Clock className="mt-0.5 h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-gray-700">
                        {entry.action === 'STATUS_CHANGE'
                          ? `Status changed from ${(entry.old_values as Record<string, string>)?.status || '?'} to ${(entry.new_values as Record<string, string>)?.status || '?'}`
                          : entry.action}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-gray-500">No activity yet.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Assign Contractor Dialog */}
      <AssignWorkOrderDialog
        violation={violation}
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        onSuccess={handleAssignSuccess}
      />

      {/* Photo Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="sr-only">After Photo</DialogTitle>
          {lightboxPhoto && (
            <img
              src={lightboxPhoto}
              alt="After photo - repair completed"
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
