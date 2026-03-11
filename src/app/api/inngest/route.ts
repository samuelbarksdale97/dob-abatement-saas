import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { parseNOI } from '@/inngest/functions/parse-noi';
import { emailSyncCron } from '@/inngest/functions/email-sync';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseNOI, emailSyncCron],
});
