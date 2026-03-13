import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  const statuses = searchParams.get('statuses'); // comma-separated multi-select
  const priority = searchParams.get('priority');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'created_at';
  const sortDir = searchParams.get('sortDir') || 'desc';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '25');
  const propertyId = searchParams.get('property_id');
  const unitId = searchParams.get('unit_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const needsAttention = searchParams.get('needs_attention');

  let query = supabase
    .from('violations')
    .select('*, violation_items(count), photos(count)', { count: 'exact' });

  // Single status filter
  if (status) {
    query = query.eq('status', status);
  }

  // Multi-select status filter
  if (statuses) {
    const statusList = statuses.split(',').map(s => s.trim()).filter(Boolean);
    if (statusList.length > 0) {
      query = query.in('status', statusList);
    }
  }

  if (priority) {
    query = query.eq('priority', parseInt(priority));
  }
  if (search) {
    query = query.or(`notice_id.ilike.%${search}%,infraction_address.ilike.%${search}%,respondent.ilike.%${search}%`);
  }
  if (propertyId) {
    query = query.eq('property_id', propertyId);
  }
  if (unitId) {
    query = query.eq('unit_id', unitId);
  }
  if (dateFrom) {
    query = query.gte('abatement_deadline', dateFrom);
  }
  if (dateTo) {
    query = query.lte('abatement_deadline', dateTo);
  }

  // "Needs attention" shortcut: overdue OR P1 OR early-stage statuses
  if (needsAttention === 'true') {
    const today = new Date().toISOString().split('T')[0];
    query = query.or(
      `priority.eq.1,status.in.(NEW,PARSED,AWAITING_PHOTOS),abatement_deadline.lt.${today}`
    );
  }

  // Sort
  const ascending = sortDir === 'asc';
  query = query.order(sortBy, { ascending });

  // Paginate
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    violations: data,
    total: count,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'Violation id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('violations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
