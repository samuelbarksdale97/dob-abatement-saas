import { google } from 'googleapis';
import crypto from 'crypto';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

/**
 * Generate the Google OAuth consent URL.
 * The `state` param carries the encrypted org_id so we can associate the
 * connection with the correct organization after the callback.
 */
export function getAuthUrl(orgId: string): string {
  const oauth2 = getOAuth2Client();
  const state = encryptToken(orgId);

  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh token
    scope: SCOPES,
    state,
  });
}

/** Exchange an authorization code for access + refresh tokens */
export async function exchangeCode(code: string) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

/** Refresh an expired access token using the stored refresh token */
export async function refreshAccessToken(refreshToken: string) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2.refreshAccessToken();
  return credentials;
}

// ============================================================
// Token encryption (AES-256-GCM)
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.EMAIL_ENCRYPTION_KEY;
  if (!key) throw new Error('EMAIL_ENCRYPTION_KEY env var is required');
  return Buffer.from(key, 'hex');
}

/** Encrypt a token string for storage */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/** Decrypt a stored encrypted token */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
