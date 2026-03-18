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

    const { invitation_id } = await request.json();
    if (!invitation_id) {
      return NextResponse.json({ error: 'invitation_id is required' }, { status: 400 });
    }

    const orgId = user.app_metadata?.org_id;

    // Fetch the invitation (must belong to this org and not yet accepted)
    const { data: invitation, error: invError } = await supabase
      .from('invitations')
      .select('*')
      .eq('id', invitation_id)
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .single();

    if (invError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found or already accepted' }, { status: 404 });
    }

    // Extend expiry by 7 days from now
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 7);

    await supabase
      .from('invitations')
      .update({ expires_at: newExpiry.toISOString() })
      .eq('id', invitation_id);

    // Build signup URL and send email
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dob-abatement-saas.vercel.app';
    const signupUrl = `${appUrl}/signup?token=${invitation.token}&org_id=${orgId}&role=${invitation.role}`;

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    const inviterName = user.user_metadata?.full_name || user.email || 'A team member';
    const orgName = org?.name || 'your organization';

    const emailContent = invitationEmail({
      inviterName,
      orgName,
      role: invitation.role,
      signupUrl,
    });

    await sendEmail({ to: invitation.email, ...emailContent });

    return NextResponse.json({ success: true, expires_at: newExpiry.toISOString() });
  } catch (error) {
    console.error('Resend invitation error:', error);
    return NextResponse.json({ error: 'Failed to resend invitation' }, { status: 500 });
  }
}
