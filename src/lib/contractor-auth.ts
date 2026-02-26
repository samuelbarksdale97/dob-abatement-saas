import { createAdminClient } from '@/lib/supabase/server';

export interface ValidatedToken {
  valid: boolean;
  error?: string;
  data?: {
    id: string;
    org_id: string;
    work_order_id: string;
    contractor_name: string;
    contractor_email: string;
    contractor_phone: string | null;
    expires_at: string;
  };
}

/**
 * Validates a contractor magic link token.
 *
 * Checks that:
 * - Token exists in database
 * - Token is not expired (expires_at > NOW())
 * - Token is not revoked (revoked_at IS NULL)
 *
 * On successful validation, updates last_accessed_at timestamp.
 *
 * @param token - The magic link token (crypto.randomUUID format)
 * @returns ValidatedToken object with validation result
 */
export async function validateContractorToken(token: string): Promise<ValidatedToken> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('contractor_tokens')
    .select('*')
    .eq('token', token)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    return {
      valid: false,
      error: 'Invalid or expired token'
    };
  }

  // Update last accessed timestamp (fire-and-forget, don't await)
  supabase
    .from('contractor_tokens')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', data.id)
    .then();

  return {
    valid: true,
    data: {
      id: data.id,
      org_id: data.org_id,
      work_order_id: data.work_order_id,
      contractor_name: data.contractor_name,
      contractor_email: data.contractor_email,
      contractor_phone: data.contractor_phone,
      expires_at: data.expires_at,
    }
  };
}
