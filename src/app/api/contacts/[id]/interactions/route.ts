import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: interactions, error } = await supabase
      .from('contact_interactions')
      .select('*')
      .eq('contact_id', id)
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ interactions });
  } catch (error) {
    console.error('Interactions fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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
    if (!role || !['OWNER', 'PROJECT_MANAGER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { interaction_type, subject, body: interactionBody, direction, occurred_at, violation_id, property_id, work_order_id } = body;

    const orgId = user.app_metadata?.org_id;

    const { data: interaction, error } = await supabase
      .from('contact_interactions')
      .insert({
        org_id: orgId,
        contact_id: id,
        interaction_type: interaction_type || 'NOTE',
        subject: subject || null,
        body: interactionBody || null,
        direction: direction || null,
        violation_id: violation_id || null,
        property_id: property_id || null,
        work_order_id: work_order_id || null,
        created_by: user.id,
        occurred_at: occurred_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ interaction }, { status: 201 });
  } catch (error) {
    console.error('Interaction create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
