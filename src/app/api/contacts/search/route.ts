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
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category');

    if (q.length < 1) {
      return NextResponse.json({ results: [] });
    }

    let query = supabase
      .from('contacts')
      .select('id, full_name, email, category, company')
      .eq('active', true)
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
      .order('full_name')
      .limit(10);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: results, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Contact search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
