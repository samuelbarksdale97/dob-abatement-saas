import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const violationId = searchParams.get('violation_id');

    let query = supabase
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (violationId) {
      query = query.eq('violation_id', violationId);
    }

    const { data: submissions, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Submissions fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role
    const role = user.app_metadata?.role;
    if (!role || !['OWNER', 'PROJECT_MANAGER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { violation_id, confirmation_number, document_storage_path, generated_pdf_path } = body;

    if (!violation_id) {
      return NextResponse.json({ error: 'violation_id is required' }, { status: 400 });
    }

    const orgId = user.app_metadata?.org_id;

    const { data: submission, error } = await supabase
      .from('submissions')
      .insert({
        org_id: orgId,
        violation_id,
        submitted_by: user.id,
        confirmation_number: confirmation_number || null,
        document_storage_path: document_storage_path || null,
        generated_pdf_path: generated_pdf_path || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-advance violation status to SUBMITTED
    await supabase
      .from('violations')
      .update({ status: 'SUBMITTED' })
      .eq('id', violation_id)
      .in('status', ['READY_FOR_SUBMISSION']);

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    console.error('Submission create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
