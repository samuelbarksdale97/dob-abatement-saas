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

    // Enrich each unit with violation_count and worst_status
    const { data: violations } = await supabase
      .from('violations')
      .select('id, unit_id, status')
      .eq('property_id', propertyId);

    const enrichedUnits = (units || []).map(unit => {
      const unitViolations = (violations || []).filter(v => v.unit_id === unit.id);
      const statusPriority: Record<string, number> = {
        'NEW': 1, 'PARSING': 2, 'PARSED': 3, 'ASSIGNED': 4, 'IN_PROGRESS': 5,
        'AWAITING_PHOTOS': 6, 'PHOTOS_UPLOADED': 7, 'READY_FOR_SUBMISSION': 8,
        'SUBMITTED': 9, 'REJECTED': 10, 'ADDITIONAL_INFO_REQUESTED': 11,
        'APPROVED': 12, 'CLOSED': 13,
      };
      const worstStatus = unitViolations.length > 0
        ? unitViolations.reduce((worst, v) =>
            (statusPriority[v.status] || 99) < (statusPriority[worst.status] || 99) ? v : worst
          ).status
        : null;

      return {
        ...unit,
        violation_count: unitViolations.length,
        worst_status: worstStatus,
      };
    });

    return NextResponse.json({ units: enrichedUnits });
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
