import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || !['OWNER', 'PROJECT_MANAGER', 'ADMIN'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const body = await request.json();
  const { violations } = body;

  if (!Array.isArray(violations) || violations.length === 0) {
    return NextResponse.json({ error: 'violations array is required' }, { status: 400 });
  }

  // Add org_id to each violation and set source
  const records = violations.map((v: Record<string, unknown>) => ({
    org_id: profile.org_id,
    notice_id: v.notice_id || null,
    respondent: v.respondent || null,
    infraction_address: v.infraction_address || v.address || null,
    date_of_service: v.date_of_service || null,
    total_fines: v.total_fines ? parseFloat(String(v.total_fines).replace(/[$,]/g, '')) : null,
    status: v.status || 'NEW',
    priority: v.priority ? parseInt(String(v.priority)) : 3,
    abatement_deadline: v.abatement_deadline || null,
    notes: v.notes || null,
    source: 'csv_import',
  }));

  const { data, error } = await supabase
    .from('violations')
    .insert(records)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    imported: data.length,
    message: `Successfully imported ${data.length} violations`,
  });
}
