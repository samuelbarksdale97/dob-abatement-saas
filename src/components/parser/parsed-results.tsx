'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, MapPin, Calendar, DollarSign, AlertTriangle, Camera, Coins } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { Violation, ViolationItem, Photo } from '@/lib/types';
import type { ParseCosts } from '@/lib/ai/schemas';
import { getPriorityColor, getPriorityLabel } from '@/lib/status-transitions';
import dynamic from 'next/dynamic';

const EvidencePhoto = dynamic(() => import('./evidence-photo').then(m => m.EvidencePhoto), {
  ssr: false,
  loading: () => (
    <div className="flex h-[312px] w-[240px] items-center justify-center rounded-lg border bg-gray-50">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    </div>
  ),
});

interface ParsedResultsProps {
  violationId: string;
}

export function ParsedResults({ violationId }: ParsedResultsProps) {
  const [violation, setViolation] = useState<Violation | null>(null);
  const [items, setItems] = useState<ViolationItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      const { data: v } = await supabase
        .from('violations')
        .select('*')
        .eq('id', violationId)
        .single();

      const { data: vi } = await supabase
        .from('violation_items')
        .select('*')
        .eq('violation_id', violationId)
        .order('item_number');

      const { data: ph } = await supabase
        .from('photos')
        .select('*')
        .eq('violation_id', violationId)
        .order('page_number');

      if (v) {
        setViolation(v as Violation);

        // Generate a signed URL for the PDF so react-pdf can render pages
        if (v.pdf_storage_path) {
          const { data: urlData } = await supabase.storage
            .from('noi-pdfs')
            .createSignedUrl(v.pdf_storage_path, 3600);
          if (urlData?.signedUrl) {
            setPdfUrl(urlData.signedUrl);
          }
        }
      }
      if (vi) setItems(vi as ViolationItem[]);
      if (ph) setPhotos(ph as Photo[]);
      setLoading(false);
    };
    fetchData();
  }, [violationId]);

  const handleConfirm = () => {
    toast.success('Violation confirmed — opening detail view');
    router.push(`/dashboard/${violationId}`);
  };

  // Group photos by violation_item_id
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!violation) {
    return <p className="text-center text-gray-500">Violation not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Notice-level info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Parsed Successfully
            </CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-sm">
                {items.length} violation{items.length !== 1 ? 's' : ''}
              </Badge>
              {photos.length > 0 && (
                <Badge variant="outline" className="text-sm">
                  <Camera className="mr-1 h-3 w-3" />
                  {photos.length} photo{photos.length !== 1 ? 's' : ''}
                </Badge>
              )}
              {(() => {
                const costs = (violation.parse_metadata as Record<string, unknown>)?.costs as ParseCosts | undefined;
                return costs?.total_usd != null ? (
                  <Badge variant="outline" className="text-sm text-amber-600">
                    <Coins className="mr-1 h-3 w-3" />
                    ${costs.total_usd.toFixed(4)}
                  </Badge>
                ) : null;
              })()}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">NOI Number</p>
              <p className="font-semibold">{violation.notice_id || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Respondent</p>
              <p className="font-semibold">{violation.respondent || '—'}</p>
            </div>
            <div className="flex items-start gap-1">
              <MapPin className="mt-0.5 h-3 w-3 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Address</p>
                <p className="font-semibold">{violation.infraction_address || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-1">
              <DollarSign className="mt-0.5 h-3 w-3 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Total Fines</p>
                <p className="font-semibold text-red-600">
                  {violation.total_fines ? `$${violation.total_fines.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3 text-gray-400" />
              <span className="text-sm text-gray-600">
                Date of Service: {violation.date_of_service || '—'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-gray-400" />
              <span className="text-sm text-gray-600">
                Priority: {getPriorityLabel(violation.priority)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Violation items with evidence photos */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Violation Items</h3>
        {items.map((item) => {
          const itemPhotos = photosByItem.get(item.id) || [];
          return (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-500">
                        #{item.item_number}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {item.violation_code}
                      </Badge>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${getPriorityColor(item.priority)}`}>
                        P{item.priority}
                      </span>
                    </div>
                    <p className="mb-1 text-sm text-gray-700">{item.violation_description}</p>
                    {item.task_description && (
                      <p className="text-sm text-blue-700">
                        <span className="font-medium">Fix: </span>
                        {item.task_description}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 text-right">
                    <p className="font-semibold text-red-600">
                      {item.fine ? `$${item.fine.toLocaleString()}` : '—'}
                    </p>
                    <p className="text-xs text-gray-500">{item.abatement_deadline}</p>
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-400">
                  <span>Location: {item.specific_location || '—'}</span>
                  <span>Floor: {item.floor_number || '—'}</span>
                  <span>Date: {item.date_of_infraction || '—'}</span>
                </div>

                {/* Evidence photos for this item */}
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
      </div>

      {/* Unmatched evidence photos */}
      {unmatchedPhotos.length > 0 && pdfUrl && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Other Evidence Photos</h3>
          <p className="text-sm text-gray-500">
            These photos were found in the NOI but could not be matched to a specific violation item.
          </p>
          <div className="flex flex-wrap gap-3">
            {unmatchedPhotos.map((photo) => (
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

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={handleConfirm}
          size="lg"
          className="flex-1"
        >
          View on Dashboard
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.push('/parse')}
        >
          Parse Another
        </Button>
      </div>
    </div>
  );
}
