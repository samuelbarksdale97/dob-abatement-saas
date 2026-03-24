import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { violationId, action } = await request.json();

    if (!violationId || !['overwrite', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: 'violationId and action (overwrite|cancel) required' },
        { status: 400 },
      );
    }

    // Verify the violation exists and belongs to the user's org
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const { data: violation } = await supabase
      .from('violations')
      .select('id, org_id, parse_status')
      .eq('id', violationId)
      .single();

    if (!violation || violation.org_id !== profile?.org_id) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    if (violation.parse_status !== 'duplicate_pending') {
      return NextResponse.json(
        { error: 'Violation is not awaiting duplicate resolution' },
        { status: 409 },
      );
    }

    // Send the decision event to Inngest to resume the pipeline
    await inngest.send({
      name: 'noi/duplicate.resolved',
      data: {
        violationId,
        action,
      },
    });

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error('Duplicate resolution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
