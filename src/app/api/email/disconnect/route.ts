import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { decryptToken } from '@/lib/google-auth';

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: connection } = await admin
      .from('email_connections')
      .select('id, access_token_encrypted')
      .eq('org_id', profile.org_id)
      .eq('provider', 'gmail')
      .maybeSingle();

    if (!connection) {
      return NextResponse.json({ error: 'No email connection found' }, { status: 404 });
    }

    // Revoke the Google OAuth token
    try {
      const accessToken = decryptToken(connection.access_token_encrypted);
      const auth = new google.auth.OAuth2();
      await auth.revokeToken(accessToken);
    } catch {
      // Token may already be invalid — proceed with deletion
    }

    // Remove the connection
    await admin
      .from('email_connections')
      .delete()
      .eq('id', connection.id);

    return NextResponse.json({ message: 'Gmail disconnected successfully' });
  } catch (error) {
    console.error('Email disconnect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Disconnect failed' },
      { status: 500 },
    );
  }
}
