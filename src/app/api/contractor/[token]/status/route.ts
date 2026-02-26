import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateContractorToken } from '@/lib/contractor-auth';

type WorkOrderStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // 1. Validate the magic link token
    const validation = await validateContractorToken(token);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { work_order_id } = validation.data!;

    // 2. Parse request body
    const body = await request.json();
    const { status } = body;

    if (!status || !['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be ASSIGNED, IN_PROGRESS, COMPLETED, or CANCELLED' },
        { status: 400 }
      );
    }

    // 3. Use admin client
    const supabase = createAdminClient();

    // 4. Get current work order
    const { data: workOrder, error: fetchError } = await supabase
      .from('work_orders')
      .select('id, status, violation_id')
      .eq('id', work_order_id)
      .single();

    if (fetchError || !workOrder) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      );
    }

    const currentStatus = workOrder.status as WorkOrderStatus;

    // 5. Validate status transition
    if (!VALID_TRANSITIONS[currentStatus].includes(status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${currentStatus} to ${status}`,
          current_status: currentStatus,
          valid_transitions: VALID_TRANSITIONS[currentStatus],
        },
        { status: 400 }
      );
    }

    // 6. Update work order status
    const updateData: any = { status };

    if (status === 'COMPLETED') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: updatedWorkOrder, error: updateError } = await supabase
      .from('work_orders')
      .update(updateData)
      .eq('id', work_order_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update work order: ${updateError.message}` },
        { status: 500 }
      );
    }

    // 7. Update violation status to match (sync work order → violation)
    let violationStatus = 'ASSIGNED';

    if (status === 'IN_PROGRESS') {
      violationStatus = 'IN_PROGRESS';
    } else if (status === 'COMPLETED') {
      violationStatus = 'PHOTOS_UPLOADED';
    } else if (status === 'CANCELLED') {
      violationStatus = 'PARSED'; // revert to parsed state
    }

    await supabase
      .from('violations')
      .update({ status: violationStatus })
      .eq('id', workOrder.violation_id);

    // 8. Return updated work order
    return NextResponse.json(
      { work_order: updatedWorkOrder },
      { status: 200 }
    );

  } catch (error) {
    console.error('Status update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
