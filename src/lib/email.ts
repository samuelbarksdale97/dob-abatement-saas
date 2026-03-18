import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'Nexark <noreply@nexark.ai>';

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
// Shared email wrapper with Nexark branding
// ============================================================================

function emailWrapper(headerBg: string, headerTitle: string, headerSubtitle: string | null, bodyHtml: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
      <div style="padding: 24px 24px 0;">
        <div style="margin-bottom: 16px;">
          <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a;">nexark</span>
        </div>
        <div style="background: ${headerBg}; color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 700;">${headerTitle}</h2>
          ${headerSubtitle ? `<p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">${headerSubtitle}</p>` : ''}
        </div>
        <div style="background: white; border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          ${bodyHtml}
        </div>
        <div style="padding: 16px 0; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #94a3b8;">
            Sent by <strong>Nexark</strong> &mdash; DOB Abatement Management
          </p>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Email Templates
// ============================================================================

export function invitationEmail(params: {
  inviterName: string;
  orgName: string;
  role: string;
  signupUrl: string;
}) {
  return {
    subject: `You've been invited to join ${params.orgName} on Nexark`,
    html: emailWrapper('#0f172a', 'Team Invitation', null, `
      <p style="margin: 0 0 16px; color: #334155;">${params.inviterName} has invited you to join <strong>${params.orgName}</strong> as a <strong>${params.role.replace('_', ' ')}</strong>.</p>
      <p style="margin: 0 0 24px; color: #64748b; font-size: 14px;">Nexark helps property managers track and resolve DOB violations efficiently. Click below to set up your account.</p>
      <a href="${params.signupUrl}" style="display: inline-block; background: #0f172a; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
        Accept Invitation
      </a>
      <p style="margin: 24px 0 0; font-size: 12px; color: #94a3b8;">
        This invitation expires in 7 days. If you didn't expect this, you can safely ignore it.
      </p>
    `),
  };
}

export function deadlineAlertEmail(params: {
  recipientName: string;
  violationAddress: string;
  noticeId: string;
  deadline: string;
  daysRemaining: number;
  violationLink: string;
}) {
  const urgencyColor = params.daysRemaining <= 0 ? '#dc2626' : params.daysRemaining <= 3 ? '#ea580c' : '#0f172a';
  const urgencyLabel = params.daysRemaining <= 0
    ? `OVERDUE by ${Math.abs(params.daysRemaining)} day${Math.abs(params.daysRemaining) !== 1 ? 's' : ''}`
    : `${params.daysRemaining} day${params.daysRemaining !== 1 ? 's' : ''} remaining`;

  return {
    subject: params.daysRemaining <= 0
      ? `[OVERDUE] Abatement deadline passed: ${params.violationAddress}`
      : `[Deadline Alert] ${params.daysRemaining} days remaining: ${params.violationAddress}`,
    html: emailWrapper(urgencyColor, 'Abatement Deadline Alert', urgencyLabel, `
      <p style="margin: 0 0 16px; color: #334155;">Hi ${params.recipientName},</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #f1f5f9;">Property</td>
          <td style="padding: 10px 0; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${params.violationAddress}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #f1f5f9;">Notice ID</td>
          <td style="padding: 10px 0; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${params.noticeId}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Deadline</td>
          <td style="padding: 10px 0; font-weight: 600; color: ${urgencyColor};">${params.deadline}</td>
        </tr>
      </table>
      <a href="${params.violationLink}" style="display: inline-block; background: ${urgencyColor}; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
        View Violation
      </a>
    `),
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
    html: emailWrapper('#16a34a', 'Submission Confirmed', null, `
      <p style="margin: 0 0 16px; color: #334155;">Hi ${params.recipientName},</p>
      <p style="margin: 0 0 16px; color: #334155;">Your abatement evidence has been submitted to DOB.</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #f1f5f9;">Property</td>
          <td style="padding: 10px 0; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${params.violationAddress}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-bottom: 1px solid #f1f5f9;">Notice ID</td>
          <td style="padding: 10px 0; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${params.noticeId}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Confirmation #</td>
          <td style="padding: 10px 0; font-weight: 600; color: #0f172a;">${params.confirmationNumber}</td>
        </tr>
      </table>
      <a href="${params.violationLink}" style="display: inline-block; background: #0f172a; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
        View Details
      </a>
    `),
  };
}
