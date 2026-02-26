import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canTransition } from '@/lib/status-transitions';
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get user profile and validate role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only PM, OWNER, or ADMIN can create work orders
    if (!['PROJECT_MANAGER', 'OWNER', 'ADMIN'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only Project Managers, Owners, and Admins can assign work orders.' },
        { status: 403 }
      );
    }

    // 3. Parse and validate request body
    const body = await request.json();
    const {
      violation_id,
      contractor_name,
      contractor_email,
      contractor_phone,
      due_date,
      notes,
    } = body;

    // Validate required fields
    if (!violation_id || !contractor_name || !contractor_email) {
      return NextResponse.json(
        { error: 'Missing required fields: violation_id, contractor_name, contractor_email' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contractor_email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // 4. Validate violation exists and can be assigned
    const { data: violation, error: violationError } = await supabase
      .from('violations')
      .select('id, status, notice_id, infraction_address, abatement_deadline, total_fines')
      .eq('id', violation_id)
      .single();

    if (violationError || !violation) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    // Check if violation status allows assignment
    const assignableStatuses = ['PARSED', 'ASSIGNED', 'IN_PROGRESS'];
    if (!assignableStatuses.includes(violation.status)) {
      return NextResponse.json(
        { error: `Cannot assign work order. Violation status is ${violation.status}. Must be PARSED, ASSIGNED, or IN_PROGRESS.` },
        { status: 409 }
      );
    }

    // 5. Generate magic link token
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    // 6. Use admin client for inserts (ensures consistent org_id)
    const adminClient = createAdminClient();

    // 6a. Upsert contractor (auto-save to registry for dropdown)
    // First check if contractor exists
    const { data: existingContractor } = await adminClient
      .from('contractors')
      .select('id, total_assignments')
      .eq('org_id', profile.org_id)
      .eq('email', contractor_email)
      .maybeSingle();

    if (existingContractor) {
      // Update existing contractor
      await adminClient
        .from('contractors')
        .update({
          name: contractor_name,
          phone: contractor_phone || null,
          last_assigned_at: new Date().toISOString(),
          total_assignments: (existingContractor.total_assignments || 0) + 1,
          active: true,
        })
        .eq('id', existingContractor.id);
    } else {
      // Insert new contractor
      await adminClient
        .from('contractors')
        .insert({
          org_id: profile.org_id,
          email: contractor_email,
          name: contractor_name,
          phone: contractor_phone || null,
          last_assigned_at: new Date().toISOString(),
          total_assignments: 1,
          active: true,
        });
    }

    // 7. Create work order
    const { data: workOrder, error: workOrderError } = await adminClient
      .from('work_orders')
      .insert({
        org_id: profile.org_id,
        violation_id,
        contractor_name,
        contractor_email,
        contractor_phone: contractor_phone || null,
        status: 'ASSIGNED',
        due_date: due_date || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (workOrderError || !workOrder) {
      return NextResponse.json(
        { error: `Failed to create work order: ${workOrderError?.message}` },
        { status: 500 }
      );
    }

    // 8. Create contractor token
    const { data: contractorToken, error: tokenError } = await adminClient
      .from('contractor_tokens')
      .insert({
        org_id: profile.org_id,
        work_order_id: workOrder.id,
        token,
        contractor_name,
        contractor_email,
        contractor_phone: contractor_phone || null,
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (tokenError || !contractorToken) {
      // Rollback work order
      await adminClient.from('work_orders').delete().eq('id', workOrder.id);
      return NextResponse.json(
        { error: `Failed to create contractor token: ${tokenError?.message}` },
        { status: 500 }
      );
    }

    // 9. Update violation status to ASSIGNED (if transitioning from PARSED)
    if (violation.status === 'PARSED' && canTransition('PARSED', 'ASSIGNED')) {
      await adminClient
        .from('violations')
        .update({ status: 'ASSIGNED' })
        .eq('id', violation_id);
    }

    // 10. Construct magic link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
    const magicLink = `${appUrl}/contractor/${token}`;

    // 11. Send email notification
    try {
      if (resend) {
        await resend.emails.send({
          from: 'DOB Abatement <noreply@yourdomain.com>', // TODO: Update with actual domain
          to: contractor_email,
          subject: `Work Order Assignment - ${violation.infraction_address || violation.notice_id}`,
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1f2937; margin-bottom: 16px;">New Work Order Assignment</h2>
              <p>Hi ${contractor_name},</p>
              <p>You've been assigned a work order for a DOB violation:</p>

              <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Address:</strong> ${violation.infraction_address || 'TBD'}</p>
                <p style="margin: 4px 0;"><strong>Notice ID:</strong> ${violation.notice_id || 'Pending'}</p>
                <p style="margin: 4px 0;"><strong>Deadline:</strong> ${violation.abatement_deadline || 'TBD'}</p>
                <p style="margin: 4px 0;"><strong>Total Fines:</strong> ${violation.total_fines ? `$${violation.total_fines.toLocaleString()}` : 'TBD'}</p>
                ${notes ? `<p style="margin: 4px 0;"><strong>Notes:</strong> ${notes}</p>` : ''}
              </div>

              <p><strong>What you need to do:</strong></p>
              <ol style="line-height: 1.6;">
                <li>Click the button below to view your assignment</li>
                <li>Review each violation item and the inspector reference photos</li>
                <li>Take BEFORE photos of each issue</li>
                <li>Complete the repairs</li>
                <li>Take AFTER photos of each completed repair</li>
              </ol>

              <div style="margin: 24px 0;">
                <a href="${magicLink}"
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px;
                          border-radius: 6px; text-decoration: none; font-weight: 600;">
                  View Assignment & Upload Photos
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px;">
                This link is personal to you and expires in 30 days.
              </p>

              <p style="color: #6b7280; font-size: 14px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                DOB Abatement System
              </p>
            </div>
          `,
        });
      }
    } catch (emailError) {
      // Don't fail the request if email fails — log and continue
      console.error('Email send failed:', emailError);
    }

    // 12. Return success response
    return NextResponse.json(
      {
        work_order: workOrder,
        token,
        magic_link: magicLink,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Work order creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
