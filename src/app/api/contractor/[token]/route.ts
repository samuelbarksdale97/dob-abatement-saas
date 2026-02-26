import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateContractorToken } from '@/lib/contractor-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // 1. Validate the magic link token
    const validation = await validateContractorToken(token);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { work_order_id, org_id } = validation.data!;

    // 2. Use admin client (contractors have no Supabase Auth session)
    const supabase = createAdminClient();

    // 3. Fetch work order with joined violation
    const { data: workOrder, error: workOrderError } = await supabase
      .from('work_orders')
      .select('*, violations(*)')
      .eq('id', work_order_id)
      .single();

    if (workOrderError || !workOrder) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      );
    }

    const violation = (workOrder as any).violations;

    // 4. Fetch violation items
    const { data: items, error: itemsError } = await supabase
      .from('violation_items')
      .select('*')
      .eq('violation_id', violation.id)
      .order('item_number');

    if (itemsError) {
      return NextResponse.json(
        { error: `Failed to fetch violation items: ${itemsError.message}` },
        { status: 500 }
      );
    }

    // 5. Fetch all photos (INSPECTOR + BEFORE + AFTER)
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .eq('violation_id', violation.id)
      .order('photo_type')
      .order('page_number');

    if (photosError) {
      return NextResponse.json(
        { error: `Failed to fetch photos: ${photosError.message}` },
        { status: 500 }
      );
    }

    // 6. Generate signed URL for the NOI PDF (for rendering INSPECTOR photos)
    let pdfUrl: string | null = null;
    if (violation.pdf_storage_path) {
      const { data: urlData } = await supabase.storage
        .from('noi-pdfs')
        .createSignedUrl(violation.pdf_storage_path, 3600); // 1 hour expiry

      pdfUrl = urlData?.signedUrl || null;
    }

    // 7. Generate signed URLs for BEFORE/AFTER photos
    const photosWithUrls = await Promise.all(
      (photos || []).map(async (photo) => {
        if (photo.photo_type === 'BEFORE' || photo.photo_type === 'AFTER') {
          const { data: urlData } = await supabase.storage
            .from('contractor-photos')
            .createSignedUrl(photo.storage_path, 3600);

          return {
            ...photo,
            signed_url: urlData?.signedUrl || null,
          };
        }
        return photo;
      })
    );

    // 8. Return contractor view data
    return NextResponse.json({
      work_order: {
        id: workOrder.id,
        status: workOrder.status,
        due_date: workOrder.due_date,
        notes: workOrder.notes,
        contractor_name: workOrder.contractor_name,
      },
      violation: {
        id: violation.id,
        notice_id: violation.notice_id,
        infraction_address: violation.infraction_address,
        status: violation.status,
        abatement_deadline: violation.abatement_deadline,
        total_fines: violation.total_fines,
      },
      items: items || [],
      photos: photosWithUrls,
      pdf_url: pdfUrl,
    });

  } catch (error) {
    console.error('Contractor view error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
