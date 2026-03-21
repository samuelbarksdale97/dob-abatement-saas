import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: violationId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the violation exists and is a duplicate
    const { data: violation } = await supabase
      .from('violations')
      .select('id, org_id, parse_status, parse_metadata')
      .eq('id', violationId)
      .single();

    if (!violation) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    if (violation.parse_status !== 'duplicate') {
      return NextResponse.json({ error: 'Violation is not a duplicate' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Log the skip in audit_log
    const parseMeta = violation.parse_metadata as Record<string, unknown>;
    await adminSupabase.from('audit_log').insert({
      org_id: violation.org_id,
      table_name: 'violations',
      record_id: violationId,
      action: 'SKIP_DUPLICATE',
      old_values: { duplicate_violation_id: parseMeta?.duplicate_violation_id },
      new_values: { skipped: true },
      changed_by: user.id,
    });

    // Delete the duplicate violation (no items/photos were inserted since pipeline halted)
    await adminSupabase
      .from('violations')
      .delete()
      .eq('id', violationId);

    return NextResponse.json({ success: true, message: 'Duplicate violation discarded' });
  } catch (error) {
    console.error('Skip duplicate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
