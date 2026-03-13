import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthUrl } from '@/lib/google-auth';

export async function GET() {
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
      return NextResponse.json({ error: 'Only owners and admins can connect email' }, { status: 403 });
    }

    // Check if already connected
    const { data: existing } = await supabase
      .from('email_connections')
      .select('id, connected_email, status')
      .eq('org_id', profile.org_id)
      .eq('provider', 'gmail')
      .maybeSingle();

    if (existing && existing.status === 'active') {
      return NextResponse.json({
        error: 'Gmail already connected',
        connected_email: existing.connected_email,
      }, { status: 409 });
    }

    const url = getAuthUrl(profile.org_id);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Email connect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate auth URL' },
      { status: 500 },
    );
  }
}
