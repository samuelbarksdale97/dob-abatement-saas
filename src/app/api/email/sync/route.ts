import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { syncEmailConnection } from '@/lib/gmail-sync';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org_id and verify role
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get the active email connection for this org
    const admin = createAdminClient();
    const { data: connection, error: connError } = await admin
      .from('email_connections')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('provider', 'gmail')
      .eq('status', 'active')
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: 'No active Gmail connection found. Please connect your Gmail first.' },
        { status: 404 },
      );
    }

    // Run the sync
    const result = await syncEmailConnection(connection);

    return NextResponse.json({
      message: 'Sync complete',
      ...result,
    });
  } catch (error) {
    console.error('Email sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
