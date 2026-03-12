import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetViolationId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { source_violation_id } = body;

    if (!source_violation_id) {
      return NextResponse.json({ error: 'source_violation_id is required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Fetch both violations
    const { data: target } = await supabase
      .from('violations')
      .select('id, org_id, notice_id')
      .eq('id', targetViolationId)
      .single();

    const { data: source } = await supabase
      .from('violations')
      .select('id, org_id, notice_id')
      .eq('id', source_violation_id)
      .single();

    if (!target || !source) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    // Get source items
    const { data: sourceItems } = await adminSupabase
      .from('violation_items')
      .select('*')
      .eq('violation_id', source_violation_id);

    // Get existing target item codes
    const { data: targetItems } = await adminSupabase
      .from('violation_items')
      .select('violation_code')
      .eq('violation_id', targetViolationId);

    const existingCodes = new Set((targetItems || []).map(i => i.violation_code?.toLowerCase()));

    // Insert only new items (different codes)
    const newItems = (sourceItems || []).filter(
      item => !existingCodes.has(item.violation_code?.toLowerCase())
    );

    let itemsMerged = 0;
    if (newItems.length > 0) {
      const itemsToInsert = newItems.map(item => ({
        org_id: target.org_id,
        violation_id: targetViolationId,
        item_number: item.item_number,
        violation_code: item.violation_code,
        priority: item.priority,
        abatement_deadline: item.abatement_deadline,
        fine: item.fine,
        violation_description: item.violation_description,
        specific_location: item.specific_location,
        floor_number: item.floor_number,
        date_of_infraction: item.date_of_infraction,
        time_of_infraction: item.time_of_infraction,
        task_description: item.task_description,
      }));

      const { error: insertError } = await adminSupabase
        .from('violation_items')
        .insert(itemsToInsert);

      if (insertError) {
        return NextResponse.json({ error: `Failed to merge items: ${insertError.message}` }, { status: 500 });
      }
      itemsMerged = itemsToInsert.length;
    }

    // Merge photos from source to target
    const { data: sourcePhotos } = await adminSupabase
      .from('photos')
      .select('*')
      .eq('violation_id', source_violation_id);

    let photosMerged = 0;
    if (sourcePhotos && sourcePhotos.length > 0) {
      const { error: photoError } = await adminSupabase
        .from('photos')
        .update({ violation_id: targetViolationId })
        .eq('violation_id', source_violation_id);

      if (!photoError) {
        photosMerged = sourcePhotos.length;
      }
    }

    // Log the merge in audit_log
    await adminSupabase.from('audit_log').insert({
      org_id: target.org_id,
      table_name: 'violations',
      record_id: targetViolationId,
      action: 'MERGE',
      old_values: { source_violation_id },
      new_values: { items_merged: itemsMerged, photos_merged: photosMerged },
      changed_by: user.id,
    });

    // Delete the source violation (items already moved/skipped)
    await adminSupabase
      .from('violation_items')
      .delete()
      .eq('violation_id', source_violation_id);

    await adminSupabase
      .from('violations')
      .delete()
      .eq('id', source_violation_id);

    return NextResponse.json({
      merged: true,
      items_merged: itemsMerged,
      items_skipped: (sourceItems?.length || 0) - itemsMerged,
      photos_merged: photosMerged,
    });
  } catch (error) {
    console.error('Merge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
