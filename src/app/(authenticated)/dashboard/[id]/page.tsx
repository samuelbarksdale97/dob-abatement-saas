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
import {
  ArrowLeft,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  User,
  Camera,
} from 'lucide-react';
import type { Violation, ViolationItem, Photo, AuditLogEntry } from '@/lib/types';
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

const EvidencePhoto = dynamic(() => import('@/components/parser/evidence-photo').then(m => m.EvidencePhoto), {
  ssr: false,
  loading: () => (
    <div className="flex h-[312px] w-[240px] items-center justify-center rounded-lg border bg-gray-50">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    </div>
  ),
});

export default function ViolationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [violation, setViolation] = useState<Violation | null>(null);
  const [items, setItems] = useState<ViolationItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      const [violationRes, itemsRes, photosRes, auditRes] = await Promise.all([
        supabase.from('violations').select('*').eq('id', id).single(),
        supabase.from('violation_items').select('*').eq('violation_id', id).order('item_number'),
        supabase.from('photos').select('*').eq('violation_id', id).order('page_number'),
        supabase.from('audit_log').select('*').eq('record_id', id).order('created_at', { ascending: false }).limit(20),
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
      if (photosRes.data) setPhotos(photosRes.data as Photo[]);
      if (auditRes.data) setAuditLog(auditRes.data as AuditLogEntry[]);
      setLoading(false);
    };
    fetchData();
  }, [id]);

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

        {/* Status actions */}
        {nextStatuses.length > 0 && (
          <div className="mb-6 flex gap-2">
            {nextStatuses.map((status) => (
              <Button
                key={status}
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange(status)}
              >
                Move to {STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        )}

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
                    {itemPhotos.length > 0 && pdfUrl && (
                      <div className="mt-4 border-t pt-4">
                        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                          <Camera className="h-3.5 w-3.5" />
                          Inspector Evidence — Page {itemPhotos.map(p => p.page_number).join(', ')}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {itemPhotos.map((photo) => (
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
    </div>
  );
}
