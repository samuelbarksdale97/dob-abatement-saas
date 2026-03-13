import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('get_portfolio_stats');

    if (error) {
      console.error('Portfolio stats error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also fetch org-level aggregate stats
    const { data: stats } = await supabase.rpc('get_violation_stats');

    return NextResponse.json({
      properties: data || [],
      stats: stats || {},
    });
  } catch (error) {
    console.error('Portfolio fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
