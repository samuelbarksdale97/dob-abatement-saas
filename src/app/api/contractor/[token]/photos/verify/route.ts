import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateContractorToken } from '@/lib/contractor-auth';
import { verifyPhotoAngle } from '@/lib/ai/gemini';

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

    const { work_order_id } = validation.data!;

    // 2. Parse request body
    const body = await request.json();
    const { photo_id, inspector_image_data } = body;

    if (!photo_id || !inspector_image_data) {
      return NextResponse.json(
        { error: 'photo_id and inspector_image_data are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 3. Validate photo belongs to this work order
    const { data: workOrder } = await supabase
      .from('work_orders')
      .select('id, violation_id')
      .eq('id', work_order_id)
      .single();

    if (!workOrder) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
    }

    const { data: photo } = await supabase
      .from('photos')
      .select('id, storage_path, violation_id, metadata, mime_type')
      .eq('id', photo_id)
      .single();

    if (!photo || photo.violation_id !== workOrder.violation_id) {
      return NextResponse.json(
        { error: 'Photo not found or does not belong to this work order' },
        { status: 400 }
      );
    }

    // 4. Download the AFTER image from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('contractor-photos')
      .download(photo.storage_path);

    if (downloadError || !fileData) {
      console.error('Failed to download AFTER photo:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download uploaded photo for verification' },
        { status: 500 }
      );
    }

    const afterBuffer = Buffer.from(await fileData.arrayBuffer());
    const afterBase64 = afterBuffer.toString('base64');

    // 5. Strip data URL prefix from inspector image if present
    let inspectorBase64 = inspector_image_data;
    const dataUrlMatch = inspectorBase64.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (dataUrlMatch) {
      inspectorBase64 = dataUrlMatch[1];
    }

    // 6. Call Gemini Vision for angle verification
    const { result, meta } = await verifyPhotoAngle(
      afterBase64,
      inspectorBase64,
      photo.mime_type || 'image/jpeg',
    );

    // 7. Update photo metadata and status
    const existingMetadata = (photo.metadata as Record<string, unknown>) || {};
    const isApproved = result.isMatch && result.confidence >= 80;

    await supabase
      .from('photos')
      .update({
        metadata: {
          ...existingMetadata,
          verification: {
            isMatch: result.isMatch,
            confidence: result.confidence,
            reasoning: result.reasoning,
            details: result.details,
            verified_at: new Date().toISOString(),
            model: meta.model,
            cost_usd: meta.usage.cost_usd,
          },
        },
        status: isApproved ? 'APPROVED' : 'PENDING_REVIEW',
        rejection_reason: isApproved
          ? null
          : `AI angle verification: ${result.confidence}% confidence — ${result.reasoning}`,
      })
      .eq('id', photo_id);

    // 8. Return verification result
    return NextResponse.json({
      verification: {
        isMatch: result.isMatch,
        confidence: result.confidence,
        reasoning: result.reasoning,
        details: result.details,
        photo_id,
      },
      usage: meta.usage,
    });
  } catch (error) {
    console.error('Photo verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
