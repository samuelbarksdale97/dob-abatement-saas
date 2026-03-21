import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: violationId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { existing_violation_id } = body;

    if (!existing_violation_id) {
      return NextResponse.json({ error: 'existing_violation_id is required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Verify both violations exist and belong to the same org
    const { data: current } = await supabase
      .from('violations')
      .select('id, org_id, pdf_storage_path')
      .eq('id', violationId)
      .single();

    const { data: existing } = await supabase
      .from('violations')
      .select('id, org_id')
      .eq('id', existing_violation_id)
      .single();

    if (!current || !existing) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    if (current.org_id !== existing.org_id) {
      return NextResponse.json({ error: 'Violations belong to different organizations' }, { status: 400 });
    }

    // Delete the existing (old) violation and all its related data
    await adminSupabase
      .from('photos')
      .delete()
      .eq('violation_id', existing_violation_id);

    await adminSupabase
      .from('violation_items')
      .delete()
      .eq('violation_id', existing_violation_id);

    await adminSupabase
      .from('work_orders')
      .delete()
      .eq('violation_id', existing_violation_id);

    await adminSupabase
      .from('submissions')
      .delete()
      .eq('violation_id', existing_violation_id);

    await adminSupabase
      .from('violations')
      .delete()
      .eq('id', existing_violation_id);

    // Log the override in audit_log
    await adminSupabase.from('audit_log').insert({
      org_id: current.org_id,
      table_name: 'violations',
      record_id: violationId,
      action: 'OVERRIDE_DUPLICATE',
      old_values: { deleted_violation_id: existing_violation_id },
      new_values: { replacement_violation_id: violationId },
      changed_by: user.id,
    });

    // Reset the current violation so the parse pipeline can run fresh
    await adminSupabase
      .from('violations')
      .update({
        status: 'NEW',
        parse_status: 'pending',
        parse_metadata: {
          steps: [
            { step: 'ai_parse', status: 'pending' },
            { step: 'insert_records', status: 'pending' },
            { step: 'analyze_pages', status: 'pending' },
            { step: 'match_photos', status: 'pending' },
            { step: 'complete', status: 'pending' },
          ],
        },
        notes: null,
      })
      .eq('id', violationId);

    // Re-trigger the parse pipeline
    await inngest.send({
      name: 'noi/parse.requested',
      data: {
        violationId,
        pdfStoragePath: current.pdf_storage_path,
        orgId: current.org_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Existing violation deleted, re-parsing document',
    });
  } catch (error) {
    console.error('Override duplicate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
