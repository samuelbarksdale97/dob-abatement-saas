import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.app_metadata?.role;
    if (!role || !['OWNER', 'PROJECT_MANAGER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { response_status, response_notes, confirmation_number } = body;

    const updates: Record<string, unknown> = {};
    if (response_status !== undefined) {
      updates.response_status = response_status;
      if (['APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED'].includes(response_status)) {
        updates.responded_at = new Date().toISOString();
      }
    }
    if (response_notes !== undefined) updates.response_notes = response_notes;
    if (confirmation_number !== undefined) updates.confirmation_number = confirmation_number;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: submission, error } = await supabase
      .from('submissions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If DOB responded, update violation status accordingly
    if (response_status && submission) {
      const statusMap: Record<string, string> = {
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        ADDITIONAL_INFO_REQUESTED: 'ADDITIONAL_INFO_REQUESTED',
      };
      const newViolationStatus = statusMap[response_status];
      if (newViolationStatus) {
        await supabase
          .from('violations')
          .update({ status: newViolationStatus })
          .eq('id', submission.violation_id);
      }
    }

    return NextResponse.json({ submission });
  } catch (error) {
    console.error('Submission update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
