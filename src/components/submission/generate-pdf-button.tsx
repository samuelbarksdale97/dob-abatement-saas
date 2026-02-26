'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { renderPdfPageToImage, fetchImageAsDataUrl } from '@/lib/pdf/prepare-images';
import { generateSubmissionPdf } from '@/lib/pdf/generate-submission';
import type { SubmissionPdfItem } from '@/lib/pdf/generate-submission';
import type { Violation, ViolationItem, Photo } from '@/lib/types';

interface GeneratePdfButtonProps {
  violation: Violation;
  items: ViolationItem[];
  photos: (Photo & { signed_url?: string })[];
  pdfUrl: string | null;
}

export function GeneratePdfButton({ violation, items, photos, pdfUrl }: GeneratePdfButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setProgress('Loading profile...');

    try {
      // 1. Fetch org OWNER profile for cover letter signer (not logged-in user)
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email, phone, org_id')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', profile.org_id)
        .single();

      // Get org OWNER for signer (the person who signs submissions)
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('org_id', profile.org_id)
        .eq('role', 'OWNER')
        .limit(1)
        .maybeSingle();

      const signer = ownerProfile || profile;

      // 2. Group photos: INSPECTOR by item, AFTER by inspector_photo_id
      const inspectorsByItem = new Map<string, Photo[]>();
      const afterByInspector = new Map<string, Photo & { signed_url?: string }>();

      for (const item of items) {
        inspectorsByItem.set(item.id, []);
      }

      for (const photo of photos) {
        if (!photo.violation_item_id) continue;

        if (photo.photo_type === 'INSPECTOR') {
          const list = inspectorsByItem.get(photo.violation_item_id);
          if (list) list.push(photo);
        } else if (photo.photo_type === 'AFTER') {
          // Link via metadata.inspector_photo_id if available
          const inspId = (photo.metadata as Record<string, unknown>)?.inspector_photo_id as string | undefined;
          if (inspId) {
            afterByInspector.set(inspId, photo);
          } else {
            // Legacy: no inspector_photo_id — fall back to keying by item id
            afterByInspector.set(`legacy_${photo.violation_item_id}`, photo);
          }
        }
      }

      // 3. Build one PDF page per INSPECTOR/AFTER pair
      setProgress('Preparing images...');
      const pdfItems: SubmissionPdfItem[] = [];
      let pairIndex = 0;

      for (const item of items) {
        const inspectors = inspectorsByItem.get(item.id) || [];

        if (inspectors.length === 0) {
          // Item has no inspector photos — still include with no before photo
          pairIndex++;
          setProgress(`Preparing photo ${pairIndex}...`);

          let remediationPhotoDataUrl: string | null = null;
          const legacyAfter = afterByInspector.get(`legacy_${item.id}`);
          if (legacyAfter?.signed_url) {
            try {
              remediationPhotoDataUrl = await fetchImageAsDataUrl(legacyAfter.signed_url);
            } catch (err) {
              console.warn(`Failed to fetch after photo for item ${item.item_number}:`, err);
            }
          }

          pdfItems.push({
            item_number: item.item_number ?? pairIndex,
            violation_code: item.violation_code || '—',
            priority: item.priority,
            abatement_deadline: item.abatement_deadline || '60 Days',
            fine: item.fine,
            violation_description: item.violation_description,
            specific_location: item.specific_location,
            task_description: item.task_description,
            date_of_infraction: item.date_of_infraction,
            time_of_infraction: item.time_of_infraction,
            inspectorPhotoDataUrl: null,
            remediationPhotoDataUrl,
          });
          continue;
        }

        // One page per inspector photo
        for (const inspectorPhoto of inspectors) {
          pairIndex++;
          setProgress(`Preparing photo ${pairIndex}...`);

          let inspectorPhotoDataUrl: string | null = null;
          let remediationPhotoDataUrl: string | null = null;

          // Render inspector photo from PDF page
          if (inspectorPhoto.page_number && pdfUrl) {
            try {
              inspectorPhotoDataUrl = await renderPdfPageToImage(pdfUrl, inspectorPhoto.page_number);
            } catch (err) {
              console.warn(`Failed to render inspector photo page ${inspectorPhoto.page_number}:`, err);
            }
          }

          // Find matching AFTER photo
          const afterPhoto = afterByInspector.get(inspectorPhoto.id)
            || afterByInspector.get(`legacy_${item.id}`); // fallback for legacy data
          if (afterPhoto?.signed_url) {
            try {
              remediationPhotoDataUrl = await fetchImageAsDataUrl(afterPhoto.signed_url);
            } catch (err) {
              console.warn(`Failed to fetch after photo for inspector ${inspectorPhoto.id}:`, err);
            }
          }

          pdfItems.push({
            item_number: item.item_number ?? pairIndex,
            violation_code: item.violation_code || '—',
            priority: item.priority,
            abatement_deadline: item.abatement_deadline || '60 Days',
            fine: item.fine,
            violation_description: item.violation_description,
            specific_location: item.specific_location,
            task_description: item.task_description,
            date_of_infraction: item.date_of_infraction,
            time_of_infraction: item.time_of_infraction,
            inspectorPhotoDataUrl,
            remediationPhotoDataUrl,
          });
        }
      }

      // 4. Generate PDF
      setProgress('Generating PDF...');
      const blob = await generateSubmissionPdf({
        address: violation.infraction_address || 'Address not available',
        respondent: violation.respondent || violation.infraction_address || 'Property Owner',
        noiNumber: violation.notice_id || 'N/A',
        noiDate: violation.date_of_service
          ? new Date(violation.date_of_service).toLocaleDateString('en-US')
          : 'N/A',
        contactName: signer.full_name || 'Property Manager',
        contactCompany: org?.name || '',
        contactEmail: signer.email || '',
        contactPhone: signer.phone,
        items: pdfItems,
      });

      // 5. Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${violation.notice_id || 'Abatement'}_Submission.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Submission PDF generated and downloaded');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setGenerating(false);
      setProgress('');
    }
  };

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleGenerate}
      disabled={generating}
    >
      {generating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {progress || 'Generating...'}
        </>
      ) : (
        <>
          <FileText className="mr-2 h-4 w-4" />
          Generate Submission Report
        </>
      )}
    </Button>
  );
}
