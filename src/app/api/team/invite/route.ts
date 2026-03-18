import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, invitationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { email, role: inviteRole } = body;

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    const validRoles = ['PROJECT_MANAGER', 'ADMIN'];
    if (inviteRole && !validRoles.includes(inviteRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const orgId = user.app_metadata?.org_id;

    // Check if already a member
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'User is already a team member' }, { status: 409 });
    }

    // Create invitation
    const { data: invitation, error } = await supabase
      .from('invitations')
      .insert({
        org_id: orgId,
        email,
        role: inviteRole || 'PROJECT_MANAGER',
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send invitation email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.yokemgmt.com';
    const signupUrl = `${appUrl}/signup?token=${invitation.token}&org_id=${orgId}&role=${inviteRole || 'PROJECT_MANAGER'}`;

    // Get org name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    const inviterName = user.user_metadata?.full_name || user.email || 'A team member';
    const orgName = org?.name || 'your organization';

    try {
      const emailContent = invitationEmail({
        inviterName,
        orgName,
        role: inviteRole || 'PROJECT_MANAGER',
        signupUrl,
      });
      await sendEmail({ to: email, ...emailContent });
    } catch (emailErr) {
      console.error('Failed to send invitation email:', emailErr);
      // Don't fail the request — invitation is created even if email fails
    }

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    console.error('Team invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
