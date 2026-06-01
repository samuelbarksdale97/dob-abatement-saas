import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/team/invite/[id]
 * Revoke a pending invitation. OWNER/ADMIN only, org-scoped. Deleting the row
 * invalidates the signup token (POST /api/signup looks the invite up by token).
 * Already-accepted invitations cannot be revoked.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Confirm the invitation belongs to this org before deleting.
    const { data: invitation } = await supabase
      .from('invitations')
      .select('id, accepted_at')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: 'Invitation already accepted; revoke the member instead.' },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, revoked: id });
  } catch (error) {
    console.error('Invite revoke error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
