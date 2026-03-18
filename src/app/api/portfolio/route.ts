import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  console.log(`[API] GET /api/portfolio — start`);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log(`[API] /api/portfolio — 401 auth failed:`, authError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`[API] /api/portfolio — user=${user.email}`);

    const { data, error } = await supabase.rpc('get_portfolio_stats');

    if (error) {
      console.error('[API] /api/portfolio — RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[API] /api/portfolio — properties=${Array.isArray(data) ? data.length : 0}, sample:`, JSON.stringify(data?.[0] ?? {}).slice(0, 200));

    // Also fetch org-level aggregate stats
    const { data: stats, error: statsError } = await supabase.rpc('get_violation_stats');
    if (statsError) {
      console.error('[API] /api/portfolio — stats RPC error:', statsError);
    }
    console.log(`[API] /api/portfolio — stats:`, JSON.stringify(stats ?? {}).slice(0, 200));

    return NextResponse.json({
      properties: data || [],
      stats: stats || {},
    });
  } catch (error) {
    console.error('[API] /api/portfolio — EXCEPTION:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
