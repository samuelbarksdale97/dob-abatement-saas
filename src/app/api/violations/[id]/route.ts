import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.app_metadata?.role;
    if (!role || !['OWNER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden — only admins can delete violations' }, { status: 403 });
    }

    const { id } = await params;

    // Verify violation exists and belongs to user's org
    const { data: violation, error: fetchError } = await supabase
      .from('violations')
      .select('id, pdf_storage_path, org_id')
      .eq('id', id)
      .single();

    if (fetchError || !violation) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    // Use admin client for cascading deletes (RLS may block some child tables)
    const admin = createAdminClient();

    // Delete in dependency order: children first, then parent

    // 1. Delete contractor tokens (via work orders)
    const { data: workOrders } = await admin
      .from('work_orders')
      .select('id')
      .eq('violation_id', id);

    if (workOrders && workOrders.length > 0) {
      const woIds = workOrders.map(wo => wo.id);
      await admin.from('contractor_tokens').delete().in('work_order_id', woIds);
    }

    // 2. Delete work orders
    await admin.from('work_orders').delete().eq('violation_id', id);

    // 3. Delete photos (and clean up storage)
    const { data: photos } = await admin
      .from('photos')
      .select('id, storage_path, photo_type')
      .eq('violation_id', id);

    if (photos && photos.length > 0) {
      // Remove files from storage buckets
      const noiPaths = photos
        .filter(p => p.photo_type === 'INSPECTOR' && p.storage_path)
        .map(p => p.storage_path);
      const contractorPaths = photos
        .filter(p => ['BEFORE', 'AFTER'].includes(p.photo_type) && p.storage_path)
        .map(p => p.storage_path);

      if (noiPaths.length > 0) {
        await admin.storage.from('noi-pdfs').remove(noiPaths);
      }
      if (contractorPaths.length > 0) {
        await admin.storage.from('contractor-photos').remove(contractorPaths);
      }

      await admin.from('photos').delete().eq('violation_id', id);
    }

    // 4. Delete violation items
    await admin.from('violation_items').delete().eq('violation_id', id);

    // 5. Delete audit log entries
    await admin.from('audit_log').delete().eq('record_id', id);

    // 6. Delete the PDF from storage
    if (violation.pdf_storage_path) {
      await admin.storage.from('noi-pdfs').remove([violation.pdf_storage_path]);
    }

    // 7. Delete the violation itself
    const { error: deleteError } = await admin
      .from('violations')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete violation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
