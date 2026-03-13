import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const admin = createAdminClient();
    const { data: connection } = await admin
      .from('email_connections')
      .select('id, connected_email, status, auto_poll_enabled, last_synced_at, last_sync_message_count, created_at')
      .eq('org_id', profile.org_id)
      .eq('provider', 'gmail')
      .maybeSingle();

    // Get recent sync log entries
    let recentSyncs: unknown[] = [];
    if (connection) {
      const { data: logs } = await admin
        .from('email_sync_log')
        .select('id, gmail_message_id, from_address, subject, received_at, violation_id, status, error_message, created_at')
        .eq('email_connection_id', connection.id)
        .order('created_at', { ascending: false })
        .limit(20);

      recentSyncs = logs || [];
    }

    return NextResponse.json({
      connection: connection || null,
      recentSyncs,
    });
  } catch (error) {
    console.error('Email status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get status' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { auto_poll_enabled } = body;

    if (typeof auto_poll_enabled !== 'boolean') {
      return NextResponse.json({ error: 'auto_poll_enabled must be a boolean' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: updated, error: updateError } = await admin
      .from('email_connections')
      .update({ auto_poll_enabled })
      .eq('org_id', profile.org_id)
      .eq('provider', 'gmail')
      .eq('status', 'active')
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: 'No active connection found' }, { status: 404 });
    }

    return NextResponse.json({ connection: updated });
  } catch (error) {
    console.error('Email status update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 },
    );
  }
}
