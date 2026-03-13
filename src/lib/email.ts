import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'DOB Abatement <notifications@yokemgmt.com>';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping email:', subject);
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });

  if (error) {
    console.error('Failed to send email:', error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return data;
}

// ============================================================================
// Email Templates
// ============================================================================

export function deadlineAlertEmail(params: {
  recipientName: string;
  violationAddress: string;
  noticeId: string;
  deadline: string;
  daysRemaining: number;
  violationLink: string;
}) {
  const urgencyColor = params.daysRemaining <= 0 ? '#dc2626' : params.daysRemaining <= 3 ? '#ea580c' : '#2563eb';
  const urgencyLabel = params.daysRemaining <= 0
    ? `OVERDUE by ${Math.abs(params.daysRemaining)} day${Math.abs(params.daysRemaining) !== 1 ? 's' : ''}`
    : `${params.daysRemaining} day${params.daysRemaining !== 1 ? 's' : ''} remaining`;

  return {
    subject: params.daysRemaining <= 0
      ? `[OVERDUE] Abatement deadline passed: ${params.violationAddress}`
      : `[Deadline Alert] ${params.daysRemaining} days remaining: ${params.violationAddress}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${urgencyColor}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">Abatement Deadline Alert</h2>
          <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">${urgencyLabel}</p>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hi ${params.recipientName},</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Property</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.violationAddress}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Notice ID</td>
              <td style="padding: 8px 0;">${params.noticeId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Deadline</td>
              <td style="padding: 8px 0; font-weight: 600; color: ${urgencyColor};">${params.deadline}</td>
            </tr>
          </table>
          <a href="${params.violationLink}" style="display: inline-block; background: ${urgencyColor}; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View Violation
          </a>
          <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            This is an automated notification from DOB Abatement SaaS.
          </p>
        </div>
      </div>
    `,
  };
}

export function submissionConfirmationEmail(params: {
  recipientName: string;
  violationAddress: string;
  noticeId: string;
  confirmationNumber: string;
  violationLink: string;
}) {
  return {
    subject: `Submission confirmed: ${params.violationAddress} (${params.confirmationNumber})`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #16a34a; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">Submission Confirmed</h2>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hi ${params.recipientName},</p>
          <p style="margin: 0 0 16px;">Your abatement evidence has been submitted to DOB.</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Property</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.violationAddress}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Notice ID</td>
              <td style="padding: 8px 0;">${params.noticeId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Confirmation #</td>
              <td style="padding: 8px 0; font-weight: 600;">${params.confirmationNumber}</td>
            </tr>
          </table>
          <a href="${params.violationLink}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View Details
          </a>
        </div>
      </div>
    `,
  };
}
