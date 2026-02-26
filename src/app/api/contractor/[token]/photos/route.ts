import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateContractorToken } from '@/lib/contractor-auth';
import { appendFileSync } from 'fs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
const DEBUG_LOG = '/tmp/dob-photo-upload-debug.log';

function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n`;
  console.log(logLine);
  try {
    appendFileSync(DEBUG_LOG, logLine);
  } catch (e) {
    console.error('Failed to write debug log:', e);
  }
}

export async function POST(
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

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const violation_item_id = formData.get('violation_item_id') as string;
    const photo_type = formData.get('photo_type') as string;
    const inspector_photo_id = formData.get('inspector_photo_id') as string | null;

    // 3. Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    if (!violation_item_id) {
      return NextResponse.json(
        { error: 'violation_item_id is required' },
        { status: 400 }
      );
    }

    if (!photo_type || !['BEFORE', 'AFTER'].includes(photo_type)) {
      return NextResponse.json(
        { error: 'photo_type must be BEFORE or AFTER' },
        { status: 400 }
      );
    }

    // 4. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File must be under 10MB' },
        { status: 400 }
      );
    }

    // 5. Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    // 6. Use admin client
    const supabase = createAdminClient();

    // 7. Get work order with violation_id
    const { data: workOrder, error: workOrderError } = await supabase
      .from('work_orders')
      .select('id, violation_id')
      .eq('id', work_order_id)
      .single();

    if (workOrderError || !workOrder) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      );
    }

    // 8. Validate violation_item belongs to this work order's violation
    const { data: violationItem, error: itemError } = await supabase
      .from('violation_items')
      .select('id, violation_id')
      .eq('id', violation_item_id)
      .single();

    if (itemError || !violationItem || violationItem.violation_id !== workOrder.violation_id) {
      return NextResponse.json(
        { error: 'Invalid violation_item_id for this work order' },
        { status: 400 }
      );
    }

    // 9. Check if photo already exists for this item + type + inspector_photo_id
    let existingQuery = supabase
      .from('photos')
      .select('id, storage_path')
      .eq('violation_item_id', violation_item_id)
      .eq('photo_type', photo_type);

    if (inspector_photo_id) {
      existingQuery = existingQuery.eq('metadata->>inspector_photo_id', inspector_photo_id);
    }

    const { data: existingPhoto } = await existingQuery.maybeSingle();

    // 10. Upload file to storage
    const timestamp = Date.now();
    const pathSuffix = inspector_photo_id
      ? `AFTER_${inspector_photo_id.slice(0, 8)}_${timestamp}`
      : `${photo_type}_${timestamp}`;
    const storagePath = `${org_id}/${work_order_id}/${violation_item_id}/${pathSuffix}.jpg`;

    console.log('Uploading to storage:', { storagePath, fileSize: file.size, fileType: file.type });

    const fileBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('contractor-photos')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    console.log('Storage upload result:', { uploadData, uploadError });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    if (!uploadData) {
      console.error('No upload data returned');
      return NextResponse.json(
        { error: 'Upload failed: No data returned from storage' },
        { status: 500 }
      );
    }

    // 11. Insert or update photo record
    let photoData;

    if (existingPhoto) {
      // Update existing photo
      const { data, error: updateError } = await supabase
        .from('photos')
        .update({
          storage_path: uploadData.path,
          file_size: file.size,
          mime_type: file.type,
          status: 'PENDING_REVIEW',
        })
        .eq('id', existingPhoto.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to update photo record: ${updateError.message}` },
          { status: 500 }
        );
      }

      photoData = data;

      // Delete old storage file (optional cleanup - don't fail if this errors)
      if (existingPhoto.storage_path !== uploadData.path) {
        await supabase.storage
          .from('contractor-photos')
          .remove([existingPhoto.storage_path]);
      }
    } else {
      // Insert new photo
      const { data, error: insertError } = await supabase
        .from('photos')
        .insert({
          org_id,
          violation_id: workOrder.violation_id,
          violation_item_id,
          photo_type,
          storage_path: uploadData.path,
          file_size: file.size,
          mime_type: file.type,
          status: 'PENDING_REVIEW',
          metadata: inspector_photo_id ? { inspector_photo_id } : {},
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: `Failed to insert photo record: ${insertError.message}` },
          { status: 500 }
        );
      }

      photoData = data;
    }

    // 12. Generate signed URL for immediate display
    const { data: urlData, error: urlError } = await supabase.storage
      .from('contractor-photos')
      .createSignedUrl(uploadData.path, 3600); // 1 hour

    if (urlError) {
      // Photo uploaded but URL generation failed - not critical
      console.error('Failed to generate signed URL:', urlError);
    }

    // 13. Return success
    return NextResponse.json(
      {
        photo: photoData,
        signed_url: urlData?.signedUrl || null,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
