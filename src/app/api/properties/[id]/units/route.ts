import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: units, error } = await supabase
      .from('units')
      .select('*')
      .eq('property_id', propertyId)
      .order('unit_number', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ units });
  } catch (error) {
    console.error('Units fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;
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

    if (!profile || !['OWNER', 'PROJECT_MANAGER', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Verify property exists and belongs to this org
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .single();

    if (propError || !property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const body = await request.json();
    const { unit_number, is_vacant, occupant_name, occupant_phone, notes } = body;

    if (!unit_number) {
      return NextResponse.json({ error: 'unit_number is required' }, { status: 400 });
    }

    const { data: unit, error } = await supabase
      .from('units')
      .insert({
        org_id: profile.org_id,
        property_id: propertyId,
        unit_number,
        is_vacant: is_vacant ?? false,
        occupant_name: occupant_name || null,
        occupant_phone: occupant_phone || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Unit "${unit_number}" already exists for this property` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error) {
    console.error('Unit creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
