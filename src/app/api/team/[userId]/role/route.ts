import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only owners can change roles
    const currentRole = user.app_metadata?.role;
    if (currentRole !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can change roles' }, { status: 403 });
    }

    const body = await request.json();
    const { role } = body;

    const validRoles = ['OWNER', 'PROJECT_MANAGER', 'ADMIN', 'CONTRACTOR'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const orgId = user.app_metadata?.org_id;

    // Check: cannot downgrade last owner
    if (userId === user.id || role !== 'OWNER') {
      // If downgrading from OWNER, check there's at least one other OWNER
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (targetProfile?.role === 'OWNER' && role !== 'OWNER') {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('role', 'OWNER');

        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: 'Cannot remove the last owner. Promote another member to Owner first.' },
            { status: 400 }
          );
        }
      }
    }

    // Use admin client to bypass RLS for profile update
    const adminSupabase = createAdminClient();

    const { data: profile, error } = await adminSupabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Role change error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
