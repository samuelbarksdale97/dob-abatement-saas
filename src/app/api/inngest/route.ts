import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { parseNOI } from '@/inngest/functions/parse-noi';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseNOI],
});
