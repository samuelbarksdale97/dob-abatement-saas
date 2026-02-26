import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch contractors for the user's org, ordered by most recently assigned
    const { data: contractors, error } = await supabase
      .from('contractors')
      .select('*')
      .eq('active', true)
      .order('last_assigned_at', { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch contractors: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ contractors: contractors || [] });
  } catch (error) {
    console.error('Contractors fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
