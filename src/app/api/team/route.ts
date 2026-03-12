import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.app_metadata?.role;
    if (!role || !['OWNER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orgId = user.app_metadata?.org_id;

    const [membersRes, invitationsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .eq('org_id', orgId)
        .order('created_at'),
      supabase
        .from('invitations')
        .select('*')
        .eq('org_id', orgId)
        .is('accepted_at', null)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    ]);

    return NextResponse.json({
      members: membersRes.data || [],
      invitations: (invitationsRes.data || []).map((inv) => ({
        ...inv,
        status: 'pending',
      })),
    });
  } catch (error) {
    console.error('Team fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
