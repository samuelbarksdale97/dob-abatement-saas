import { inngest } from '@/inngest/client';
import { createAdminClient } from '@/lib/supabase/server';
import { syncEmailConnection } from '@/lib/gmail-sync';

/**
 * Inngest cron function: polls all active email connections with auto_poll_enabled.
 * Runs every 5 minutes. Each connection is synced independently.
 */
export const emailSyncCron = inngest.createFunction(
  {
    id: 'email-sync-cron',
    name: 'Email Sync Cron',
    retries: 1,
  },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    // 1. Fetch all active connections with auto-poll enabled
    const connections = await step.run('fetch-connections', async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('email_connections')
        .select('*')
        .eq('status', 'active')
        .eq('auto_poll_enabled', true);

      if (error) throw new Error(`Failed to fetch connections: ${error.message}`);
      return data || [];
    });

    if (connections.length === 0) {
      return { message: 'No active connections with auto-poll enabled' };
    }

    // 2. Sync each connection
    const results = [];
    for (const connection of connections) {
      const result = await step.run(`sync-${connection.id}`, async () => {
        try {
          const syncResult = await syncEmailConnection(connection);
          return {
            connectionId: connection.id,
            email: connection.connected_email,
            ...syncResult,
          };
        } catch (err) {
          // Mark connection as expired if token refresh fails
          if (err instanceof Error && err.message.includes('invalid_grant')) {
            const supabase = createAdminClient();
            await supabase
              .from('email_connections')
              .update({ status: 'expired' })
              .eq('id', connection.id);
          }
          return {
            connectionId: connection.id,
            email: connection.connected_email,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });
      results.push(result);
    }

    return { synced: results.length, results };
  },
);
