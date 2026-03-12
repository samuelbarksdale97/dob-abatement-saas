import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, submissionConfirmationEmail } from '@/lib/email';

/**
 * Event-driven function that sends emails when certain events occur:
 * - Submission created → confirmation email to org PMs/owners
 * - Status change → notification email (if user has it enabled)
 */
export const sendNotificationEmail = inngest.createFunction(
  {
    id: 'send-notification-email',
    name: 'Send Notification Email',
    retries: 2,
  },
  { event: 'notification/email.requested' },
  async ({ event, step }) => {
    const { type, payload } = event.data;
    const supabase = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.yokemgmt.com';

    if (type === 'submission_created') {
      await step.run('send-submission-email', async () => {
        const { violation_id, confirmation_number, org_id } = payload;

        // Get violation details
        const { data: violation } = await supabase
          .from('violations')
          .select('notice_id, infraction_address')
          .eq('id', violation_id)
          .single();

        if (!violation) return;

        // Get org members with email enabled
        const { data: members } = await supabase
          .from('profiles')
          .select('full_name, email, settings')
          .eq('org_id', org_id)
          .in('role', ['OWNER', 'PROJECT_MANAGER', 'ADMIN']);

        if (!members) return;

        for (const member of members) {
          const settings = (member.settings as Record<string, boolean> | null) || {};
          if (settings.email_status_changes === false) continue;
          if (!member.email) continue;

          const emailContent = submissionConfirmationEmail({
            recipientName: member.full_name || 'Team Member',
            violationAddress: violation.infraction_address || 'Unknown',
            noticeId: violation.notice_id || 'N/A',
            confirmationNumber: confirmation_number || 'Pending',
            violationLink: `${appUrl}/dashboard/${violation_id}`,
          });

          try {
            await sendEmail({
              to: member.email,
              subject: emailContent.subject,
              html: emailContent.html,
            });
          } catch (err) {
            console.error(`Failed to send submission email to ${member.email}:`, err);
          }
        }
      });
    }

    return { success: true, type };
  },
);
