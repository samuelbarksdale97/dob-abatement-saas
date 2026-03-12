import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; unitId: string }> }
) {
  try {
    const { unitId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { unit_number, is_vacant, occupant_name, occupant_phone, notes } = body;

    const updates: Record<string, unknown> = {};
    if (unit_number !== undefined) updates.unit_number = unit_number;
    if (is_vacant !== undefined) updates.is_vacant = is_vacant;
    if (occupant_name !== undefined) updates.occupant_name = occupant_name;
    if (occupant_phone !== undefined) updates.occupant_phone = occupant_phone;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: unit, error } = await supabase
      .from('units')
      .update(updates)
      .eq('id', unitId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Unit number "${unit_number}" already exists for this property` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('Unit update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
