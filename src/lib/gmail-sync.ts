import { google, gmail_v1 } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/server';
import { refreshAccessToken, decryptToken, encryptToken } from '@/lib/google-auth';
import { inngest } from '@/inngest/client';

interface EmailConnection {
  id: string;
  org_id: string;
  connected_email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
  auto_poll_enabled: boolean;
  last_synced_at: string | null;
  status: string;
}

interface SyncResult {
  messagesFound: number;
  violationsCreated: number;
  skipped: number;
  errors: string[];
}

/** Build a Gmail API client from an email connection record */
async function getGmailClient(connection: EmailConnection): Promise<{
  gmail: gmail_v1.Gmail;
  updatedConnection?: Partial<EmailConnection>;
}> {
  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  let accessToken = decryptToken(connection.access_token_encrypted);

  // Refresh if expired or expiring within 5 minutes
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  let updatedConnection: Partial<EmailConnection> | undefined;

  if (needsRefresh) {
    const credentials = await refreshAccessToken(refreshToken);
    accessToken = credentials.access_token!;

    updatedConnection = {
      access_token_encrypted: encryptToken(accessToken),
      token_expires_at: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : null,
    };
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  return {
    gmail: google.gmail({ version: 'v1', auth }),
    updatedConnection,
  };
}

/** Search Gmail for NOI-related emails with PDF attachments */
export async function searchForNOIEmails(
  gmail: gmail_v1.Gmail,
  afterDate?: string,
): Promise<gmail_v1.Schema$Message[]> {
  // Search for DOB/housing violation emails with attachments
  let query =
    'from:(@dc.gov OR @dcra.dc.gov OR "Department of Buildings") ' +
    'subject:(NOI OR "Notice of Infraction" OR "housing violation" OR "code violation") ' +
    'has:attachment';

  if (afterDate) {
    query += ` after:${afterDate}`;
  }

  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20,
  });

  return response.data.messages || [];
}

/** Get full email details including attachment metadata */
export async function getEmailDetails(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<gmail_v1.Schema$Message> {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  return response.data;
}

/** Download a PDF attachment from a Gmail message */
export async function extractPdfAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const response = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  const data = response.data.data;
  if (!data) throw new Error('Empty attachment data');

  // Gmail API returns URL-safe base64
  return Buffer.from(data, 'base64url');
}

/** Add a "DOB-Processed" label to an email (creates label if needed) */
export async function labelEmailAsProcessed(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<void> {
  const LABEL_NAME = 'DOB-Processed';

  // Find or create the label
  const labels = await gmail.users.labels.list({ userId: 'me' });
  let label = labels.data.labels?.find((l) => l.name === LABEL_NAME);

  if (!label) {
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: LABEL_NAME,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    label = created.data;
  }

  if (label?.id) {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: [label.id] },
    });
  }
}

/** Extract header value from a Gmail message */
function getHeader(
  message: gmail_v1.Schema$Message,
  name: string,
): string | undefined {
  return message.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  )?.value ?? undefined;
}

/** Find PDF attachments in a Gmail message */
function findPdfParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
): { filename: string; attachmentId: string }[] {
  const results: { filename: string; attachmentId: string }[] = [];
  if (!payload) return results;

  function walk(part: gmail_v1.Schema$MessagePart) {
    if (
      part.mimeType === 'application/pdf' &&
      part.body?.attachmentId &&
      part.filename
    ) {
      results.push({
        filename: part.filename,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(payload);
  return results;
}

/**
 * Process a single NOI email: extract PDF → upload → create violation → trigger parse.
 * Returns the violation ID if successfully created, or null if skipped.
 */
async function processNOIEmail(
  gmail: gmail_v1.Gmail,
  connection: EmailConnection,
  messageId: string,
): Promise<{ violationId: string | null; status: string; error?: string }> {
  const supabase = createAdminClient();

  // Check if already processed
  const { data: existing } = await supabase
    .from('email_sync_log')
    .select('id')
    .eq('email_connection_id', connection.id)
    .eq('gmail_message_id', messageId)
    .maybeSingle();

  if (existing) {
    return { violationId: null, status: 'skipped' };
  }

  // Get full message
  const message = await getEmailDetails(gmail, messageId);
  const from = getHeader(message, 'From') || '';
  const subject = getHeader(message, 'Subject') || '';
  const dateStr = getHeader(message, 'Date');
  const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

  // Find PDF attachments
  const pdfParts = findPdfParts(message.payload);
  if (pdfParts.length === 0) {
    // Log as skipped — no PDF attachment
    await supabase.from('email_sync_log').insert({
      org_id: connection.org_id,
      email_connection_id: connection.id,
      gmail_message_id: messageId,
      from_address: from,
      subject,
      received_at: receivedAt,
      status: 'skipped',
      error_message: 'No PDF attachment found',
    });
    return { violationId: null, status: 'skipped' };
  }

  // Process the first PDF attachment (most NOI emails have one PDF)
  const pdfPart = pdfParts[0];
  try {
    const pdfBuffer = await extractPdfAttachment(gmail, messageId, pdfPart.attachmentId);

    // Upload to Supabase Storage
    const storagePath = `${connection.org_id}/email-imports/${messageId}/${pdfPart.filename}`;
    const { error: uploadError } = await supabase.storage
      .from('noi-pdfs')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Create violation record
    const { data: violation, error: insertError } = await supabase
      .from('violations')
      .insert({
        org_id: connection.org_id,
        pdf_storage_path: storagePath,
        source: 'email',
        status: 'NEW',
        parse_status: 'pending',
        parse_metadata: {
          email_subject: subject,
          email_from: from,
          email_received_at: receivedAt,
          gmail_message_id: messageId,
          steps: [
            { step: 'ai_parse', status: 'pending' },
            { step: 'insert_records', status: 'pending' },
            { step: 'analyze_pages', status: 'pending' },
            { step: 'match_photos', status: 'pending' },
            { step: 'complete', status: 'pending' },
          ],
        },
      })
      .select()
      .single();

    if (insertError || !violation) {
      throw new Error(`Failed to create violation: ${insertError?.message}`);
    }

    // Trigger parse pipeline
    await inngest.send({
      name: 'noi/parse.requested',
      data: {
        violationId: violation.id,
        pdfStoragePath: storagePath,
        orgId: connection.org_id,
      },
    });

    // Label email as processed
    try {
      await labelEmailAsProcessed(gmail, messageId);
    } catch {
      // Non-critical — don't fail the sync
    }

    // Log success
    await supabase.from('email_sync_log').insert({
      org_id: connection.org_id,
      email_connection_id: connection.id,
      gmail_message_id: messageId,
      from_address: from,
      subject,
      received_at: receivedAt,
      violation_id: violation.id,
      status: 'processed',
    });

    return { violationId: violation.id, status: 'processed' };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Log failure
    await supabase.from('email_sync_log').insert({
      org_id: connection.org_id,
      email_connection_id: connection.id,
      gmail_message_id: messageId,
      from_address: from,
      subject,
      received_at: receivedAt,
      status: 'failed',
      error_message: errorMessage,
    });

    return { violationId: null, status: 'failed', error: errorMessage };
  }
}

/**
 * Sync a single email connection: refresh token, search Gmail, process new emails.
 */
export async function syncEmailConnection(connection: EmailConnection): Promise<SyncResult> {
  const supabase = createAdminClient();
  const result: SyncResult = { messagesFound: 0, violationsCreated: 0, skipped: 0, errors: [] };

  // Build Gmail client (refreshes token if needed)
  const { gmail, updatedConnection } = await getGmailClient(connection);

  // Persist refreshed token if updated
  if (updatedConnection) {
    await supabase
      .from('email_connections')
      .update(updatedConnection)
      .eq('id', connection.id);
  }

  // Search for NOI emails (only after last sync to avoid re-processing)
  const afterDate = connection.last_synced_at
    ? new Date(connection.last_synced_at).toISOString().split('T')[0].replace(/-/g, '/')
    : undefined;

  const messages = await searchForNOIEmails(gmail, afterDate);
  result.messagesFound = messages.length;

  // Process each message
  for (const msg of messages) {
    if (!msg.id) continue;

    const outcome = await processNOIEmail(gmail, connection, msg.id);
    if (outcome.status === 'processed') {
      result.violationsCreated++;
    } else if (outcome.status === 'skipped') {
      result.skipped++;
    } else if (outcome.status === 'failed') {
      result.errors.push(outcome.error || 'Unknown error');
    }
  }

  // Update last synced timestamp
  await supabase
    .from('email_connections')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_message_count: result.violationsCreated,
    })
    .eq('id', connection.id);

  return result;
}
