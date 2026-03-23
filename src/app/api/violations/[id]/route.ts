import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Delete in dependency order
    await supabase.from('photos').delete().eq('violation_id', id);
    await supabase.from('violation_items').delete().eq('violation_id', id);
    await supabase.from('work_orders').delete().eq('violation_id', id);
    await supabase.from('contractor_tokens').delete().eq('violation_id', id);
    await supabase.from('audit_log').delete().eq('violation_id', id);

    const { error } = await supabase.from('violations').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Violation delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
