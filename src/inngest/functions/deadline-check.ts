import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, deadlineAlertEmail } from '@/lib/email';

/**
 * Daily cron job that checks for approaching and overdue deadlines.
 * Creates in-app notifications and sends email alerts.
 *
 * Runs daily at 8:00 AM ET (13:00 UTC).
 * Checks for violations that are:
 *   - Overdue (deadline < today)
 *   - Due within 3 days
 *   - Due within 10 days
 */
export const deadlineCheck = inngest.createFunction(
  {
    id: 'deadline-check',
    name: 'Daily Deadline Check',
    retries: 2,
  },
  { cron: '0 13 * * *' }, // 8 AM ET
  async ({ step }) => {
    const supabase = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.yokemgmt.com';

    // Step 1: Find violations with approaching/overdue deadlines
    const violations = await step.run('find-deadline-violations', async () => {
      const today = new Date().toISOString().split('T')[0];
      const tenDaysFromNow = new Date();
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
      const tenDaysStr = tenDaysFromNow.toISOString().split('T')[0];

      // Find open violations with deadlines within 10 days or overdue
      const { data, error } = await supabase
        .from('violations')
        .select('id, org_id, notice_id, infraction_address, abatement_deadline, status, property_id')
        .lte('abatement_deadline', tenDaysStr)
        .not('status', 'in', '("CLOSED","APPROVED","SUBMITTED")')
        .not('abatement_deadline', 'is', null)
        .order('abatement_deadline', { ascending: true });

      if (error) {
        throw new Error(`Failed to query violations: ${error.message}`);
      }

      return data || [];
    });

    if (violations.length === 0) {
      return { message: 'No deadline violations found', notified: 0 };
    }

    // Step 2: Create notifications and send emails
    const results = await step.run('create-notifications', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let notificationsCreated = 0;
      let emailsSent = 0;

      for (const violation of violations) {
        const deadline = new Date(violation.abatement_deadline);
        deadline.setHours(0, 0, 0, 0);
        const daysRemaining = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);

        // Determine notification priority
        let priority: string;
        let type: string;
        if (daysRemaining <= 0) {
          priority = 'urgent';
          type = 'error';
        } else if (daysRemaining <= 3) {
          priority = 'high';
          type = 'warning';
        } else {
          priority = 'normal';
          type = 'info';
        }

        // Check if we already sent a notification for this violation today
        const todayStr = new Date().toISOString().split('T')[0];
        const { count: existingCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('link', `/dashboard/${violation.id}`)
          .gte('created_at', `${todayStr}T00:00:00Z`);

        if ((existingCount ?? 0) > 0) continue; // Already notified today

        // Get org members to notify (PM, OWNER, ADMIN roles)
        const { data: members } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, settings')
          .eq('org_id', violation.org_id)
          .in('role', ['OWNER', 'PROJECT_MANAGER', 'ADMIN']);

        if (!members || members.length === 0) continue;

        const title = daysRemaining <= 0
          ? `Overdue: ${violation.infraction_address || violation.notice_id}`
          : `Deadline in ${daysRemaining}d: ${violation.infraction_address || violation.notice_id}`;

        const message = `Notice ${violation.notice_id || 'Unknown'} — deadline ${
          daysRemaining <= 0 ? 'was' : 'is'
        } ${new Date(violation.abatement_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

        for (const member of members) {
          // Create in-app notification
          await supabase.from('notifications').insert({
            org_id: violation.org_id,
            user_id: member.id,
            title,
            message,
            type,
            priority,
            link: `/dashboard/${violation.id}`,
          });
          notificationsCreated++;

          // Send email if user has email alerts enabled
          const settings = (member.settings as Record<string, boolean> | null) || {};
          const emailEnabled = settings.email_deadline_alerts !== false; // default true

          if (emailEnabled && member.email) {
            try {
              const emailContent = deadlineAlertEmail({
                recipientName: member.full_name || 'Team Member',
                violationAddress: violation.infraction_address || 'Unknown Address',
                noticeId: violation.notice_id || 'N/A',
                deadline: new Date(violation.abatement_deadline).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                }),
                daysRemaining,
                violationLink: `${appUrl}/dashboard/${violation.id}`,
              });

              await sendEmail({
                to: member.email,
                subject: emailContent.subject,
                html: emailContent.html,
              });
              emailsSent++;
            } catch (err) {
              console.error(`Failed to send deadline email to ${member.email}:`, err);
            }
          }
        }
      }

      return { notificationsCreated, emailsSent };
    });

    return {
      message: `Deadline check complete`,
      violations_checked: violations.length,
      ...results,
    };
  },
);
