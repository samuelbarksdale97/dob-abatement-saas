import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/inngest/client';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { pdfStoragePath } = body;

  if (!pdfStoragePath) {
    return NextResponse.json({ error: 'pdfStoragePath is required' }, { status: 400 });
  }

  // Get user's org_id from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || !['OWNER', 'PROJECT_MANAGER', 'ADMIN'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Create a violation record in NEW status
  const { data: violation, error: insertError } = await supabase
    .from('violations')
    .insert({
      org_id: profile.org_id,
      pdf_storage_path: pdfStoragePath,
      source: 'parser',
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
    })
    .select()
    .single();

  if (insertError || !violation) {
    return NextResponse.json({ error: insertError?.message || 'Failed to create violation' }, { status: 500 });
  }

  // Trigger the Inngest parse function
  await inngest.send({
    name: 'noi/parse.requested',
    data: {
      violationId: violation.id,
      pdfStoragePath,
      orgId: profile.org_id,
    },
  });

  return NextResponse.json({
    violationId: violation.id,
    message: 'Parse job started',
  });
}
