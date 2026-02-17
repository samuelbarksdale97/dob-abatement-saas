'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

/**
 * Listens for Supabase auth state changes and keeps server-side
 * session cookies in sync by calling router.refresh() on token refresh.
 * Without this, the middleware's cookies go stale and redirect to login.
 */
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.push('/login');
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        // Re-run middleware so server cookies get the fresh token
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
