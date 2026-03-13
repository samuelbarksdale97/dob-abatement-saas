import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/server';
import { exchangeCode, decryptToken, encryptToken } from '@/lib/google-auth';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const error = request.nextUrl.searchParams.get('error');

    if (error) {
      // User denied access
      return NextResponse.redirect(
        new URL('/settings?email_error=access_denied', request.url),
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/settings?email_error=missing_params', request.url),
      );
    }

    // Decrypt org_id from state param
    let orgId: string;
    try {
      orgId = decryptToken(state);
    } catch {
      return NextResponse.redirect(
        new URL('/settings?email_error=invalid_state', request.url),
      );
    }

    // Exchange authorization code for tokens
    const tokens = await exchangeCode(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/settings?email_error=no_tokens', request.url),
      );
    }

    // Get the connected email address
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: tokens.access_token });
    const gmail = google.gmail({ version: 'v1', auth });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const connectedEmail = profile.data.emailAddress || 'unknown';

    // Store encrypted tokens
    const supabase = createAdminClient();

    // Upsert — replace existing connection for this org+provider
    const { error: upsertError } = await supabase
      .from('email_connections')
      .upsert(
        {
          org_id: orgId,
          provider: 'gmail',
          connected_email: connectedEmail,
          access_token_encrypted: encryptToken(tokens.access_token),
          refresh_token_encrypted: encryptToken(tokens.refresh_token),
          token_expires_at: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          status: 'active',
        },
        { onConflict: 'org_id,provider' },
      );

    if (upsertError) {
      console.error('Failed to store email connection:', upsertError);
      return NextResponse.redirect(
        new URL('/settings?email_error=storage_failed', request.url),
      );
    }

    return NextResponse.redirect(
      new URL(`/settings?email_connected=${encodeURIComponent(connectedEmail)}`, request.url),
    );
  } catch (error) {
    console.error('Email callback error:', error);
    return NextResponse.redirect(
      new URL('/settings?email_error=callback_failed', request.url),
    );
  }
}
