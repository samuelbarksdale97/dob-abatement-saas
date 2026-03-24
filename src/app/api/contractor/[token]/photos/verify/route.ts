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

    // 4. Check if photo verification is disabled via org settings
    const { data: org } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', validation.data!.org_id)
      .single();

    const orgSettings = (org?.settings as Record<string, unknown>) || {};
    const skipVerification = orgSettings.skip_photo_verification === true;

    let result: { isMatch: boolean; confidence: number; reasoning: string; details: string };
    let meta: { model: string; usage: { cost_usd: number } } | null = null;

    if (skipVerification) {
      // QA mode: auto-approve without calling Gemini
      result = {
        isMatch: true,
        confidence: 100,
        reasoning: 'QA mode: verification skipped',
        details: 'Photo auto-approved via admin toggle. AI angle verification was disabled in organization settings.',
      };
    } else {
      // 4b. Download the AFTER image from storage
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
      const geminiResult = await verifyPhotoAngle(
        afterBase64,
        inspectorBase64,
        photo.mime_type || 'image/jpeg',
      );
      result = geminiResult.result;
      meta = geminiResult.meta;
    }

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
            model: meta?.model || 'skipped',
            cost_usd: meta?.usage.cost_usd || 0,
            skipped: skipVerification,
          },
        },
        status: isApproved ? 'APPROVED' : 'PENDING_REVIEW',
        rejection_reason: isApproved
          ? null
          : `AI angle verification: ${result.confidence}% confidence — ${result.reasoning}`,
      })
      .eq('id', photo_id);

    // 8. Auto-progression: if all AFTER photos are approved, advance violation
    if (isApproved) {
      const { data: allAfterPhotos } = await supabase
        .from('photos')
        .select('id, status')
        .eq('violation_id', workOrder.violation_id)
        .eq('photo_type', 'AFTER');

      if (allAfterPhotos && allAfterPhotos.length > 0) {
        const allApproved = allAfterPhotos.every((p) => p.status === 'APPROVED');
        if (allApproved) {
          await supabase
            .from('violations')
            .update({ status: 'READY_FOR_SUBMISSION' })
            .eq('id', workOrder.violation_id)
            .eq('status', 'PHOTOS_UPLOADED');
        }
      }
    }

    // 9. Return verification result
    return NextResponse.json({
      verification: {
        isMatch: result.isMatch,
        confidence: result.confidence,
        reasoning: result.reasoning,
        details: result.details,
        photo_id,
        skipped: skipVerification,
      },
      usage: meta?.usage || { cost_usd: 0 },
    });
  } catch (error) {
    console.error('Photo verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
