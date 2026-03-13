import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const propertyId = searchParams.get('property_id') || null;
  const dateFrom = searchParams.get('date_from') || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const dateTo = searchParams.get('date_to') || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase.rpc('get_analytics', {
    p_property_id: propertyId,
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
