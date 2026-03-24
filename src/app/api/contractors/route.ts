import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch contractors from the unified contacts table (category = CONTRACTOR)
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, full_name, email, phone, total_interactions, last_interaction_at')
      .eq('category', 'CONTRACTOR')
      .eq('active', true)
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch contractors: ${error.message}` },
        { status: 500 }
      );
    }

    // Map contacts shape to the contractor shape expected by the assign-work-order dialog
    const contractors = (contacts || []).map((c) => ({
      id: c.id,
      name: c.full_name,
      email: c.email,
      phone: c.phone,
      total_assignments: c.total_interactions,
      last_assigned_at: c.last_interaction_at,
    }));

    return NextResponse.json({ contractors });
  } catch (error) {
    console.error('Contractors fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
