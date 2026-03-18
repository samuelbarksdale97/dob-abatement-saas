import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, full_name, password } = body;

    if (!token || !full_name || !password) {
      return NextResponse.json(
        { error: 'token, full_name, and password are required' },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Look up the invitation by token
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 400 },
      );
    }

    // Check expiration
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired. Please ask your team admin for a new one.' },
        { status: 400 },
      );
    }

    // Create the auth user with admin client
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        org_id: invitation.org_id,
      },
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Try signing in instead.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const userId = authData.user.id;

    // Create the profile row (links user to org with the invited role)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        org_id: invitation.org_id,
        email: invitation.email,
        full_name,
        role: invitation.role,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // User is created but profile failed — still return success
      // The custom_access_token_hook will pick up the profile on next login
    }

    // Update auth user app_metadata so JWT has org_id and role immediately
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        org_id: invitation.org_id,
        role: invitation.role,
      },
    });

    // Mark invitation as accepted
    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    return NextResponse.json({
      success: true,
      email: invitation.email,
      org_id: invitation.org_id,
      role: invitation.role,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
