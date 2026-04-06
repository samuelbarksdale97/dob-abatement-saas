import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { parseNOI } from '@/inngest/functions/parse-noi';
import { emailSyncCron } from '@/inngest/functions/email-sync';
// import { deadlineCheck } from '@/inngest/functions/deadline-check'; // Disabled during backfill period — re-enable when caught up on old abatements
import { sendNotificationEmail } from '@/inngest/functions/send-notification-email';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseNOI, emailSyncCron, sendNotificationEmail], // deadlineCheck removed temporarily
});
