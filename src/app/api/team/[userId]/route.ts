import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

// Ban duration used to lock a deactivated member out of auth (~100 years).
const DEACTIVATE_BAN = '876000h';

/**
 * DELETE /api/team/[userId]
 * Deactivate (soft-remove) a team member: sets profiles.active = false and bans
 * the auth user so they can no longer sign in. History is preserved. OWNER-only,
 * cannot target self, and cannot remove the last active OWNER.
 */
export async function DELETE(
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

    if (user.app_metadata?.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can remove members' }, { status: 403 });
    }

    if (userId === user.id) {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
    }

    const orgId = user.app_metadata?.org_id;

    // Target must belong to the caller's org.
    const { data: target } = await supabase
      .from('profiles')
      .select('id, role, active')
      .eq('id', userId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot remove the last active owner.
    if (target.role === 'OWNER') {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'OWNER')
        .eq('active', true);

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner. Promote another member to Owner first.' },
          { status: 400 }
        );
      }
    }

    const admin = createAdminClient();

    // Soft-deactivate the profile (admin client bypasses RLS).
    const { error: updateError } = await admin
      .from('profiles')
      .update({ active: false })
      .eq('id', userId)
      .eq('org_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Revoke access: the ban invalidates refresh tokens (no new sessions) and is
    // enforced immediately on every getUser()/middleware check. Caveat inherent to
    // stateless JWTs: an already-issued access token stays valid until it expires
    // (~1h) for any direct PostgREST call that bypasses the app, since RLS reads JWT
    // claims, not ban state. A hard instant cutoff would require rotating the JWT secret.
    await admin.auth.admin.updateUserById(userId, { ban_duration: DEACTIVATE_BAN });

    return NextResponse.json({ success: true, deactivated: userId });
  } catch (error) {
    console.error('Member deactivate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/team/[userId]  body: { active: true }
 * Reactivate a previously deactivated member: clears the flag and lifts the
 * auth ban. OWNER-only.
 */
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

    if (user.app_metadata?.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can reactivate members' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.active !== true) {
      return NextResponse.json(
        { error: 'Only reactivation (active: true) is supported here' },
        { status: 400 }
      );
    }

    const orgId = user.app_metadata?.org_id;

    const { data: target } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const admin = createAdminClient();

    const { error: updateError } = await admin
      .from('profiles')
      .update({ active: true })
      .eq('id', userId)
      .eq('org_id', orgId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Lift the auth ban.
    await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });

    return NextResponse.json({ success: true, reactivated: userId });
  } catch (error) {
    console.error('Member reactivate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
