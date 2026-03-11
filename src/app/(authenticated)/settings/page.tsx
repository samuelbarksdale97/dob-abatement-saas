'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Mail,
  RefreshCw,
  Unplug,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface EmailConnection {
  id: string;
  connected_email: string;
  status: string;
  auto_poll_enabled: boolean;
  last_synced_at: string | null;
  last_sync_message_count: number;
  created_at: string;
}

interface SyncLogEntry {
  id: string;
  gmail_message_id: string;
  from_address: string | null;
  subject: string | null;
  received_at: string | null;
  violation_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl p-6"><p className="text-gray-500">Loading settings...</p></div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<EmailConnection | null>(null);
  const [recentSyncs, setRecentSyncs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [togglingPoll, setTogglingPoll] = useState(false);

  // Handle OAuth callback params
  useEffect(() => {
    const emailConnected = searchParams.get('email_connected');
    const emailError = searchParams.get('email_error');

    if (emailConnected) {
      toast.success(`Gmail connected: ${emailConnected}`);
      // Clean URL
      window.history.replaceState({}, '', '/settings');
    }
    if (emailError) {
      const messages: Record<string, string> = {
        access_denied: 'Gmail access was denied',
        missing_params: 'Missing OAuth parameters',
        invalid_state: 'Invalid OAuth state — please try again',
        no_tokens: 'Failed to get access tokens',
        storage_failed: 'Failed to save connection',
        callback_failed: 'OAuth callback failed',
      };
      toast.error(messages[emailError] || `Gmail connection error: ${emailError}`);
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams]);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/email/status');
      const data = await response.json();
      if (response.ok) {
        setConnection(data.connection);
        setRecentSyncs(data.recentSyncs || []);
      }
    } catch (err) {
      console.error('Failed to fetch email status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const response = await fetch('/api/email/connect');
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Failed to start connection');
        setConnecting(false);
      }
    } catch {
      toast.error('Failed to connect Gmail');
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/email/sync', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        toast.success(
          `Sync complete: ${data.violationsCreated} new violation(s) found, ${data.skipped} skipped`,
        );
        await fetchStatus();
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAutoPoll = async (enabled: boolean) => {
    setTogglingPoll(true);
    try {
      const response = await fetch('/api/email/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_poll_enabled: enabled }),
      });
      const data = await response.json();
      if (response.ok) {
        setConnection(data.connection);
        toast.success(enabled ? 'Auto-sync enabled' : 'Auto-sync disabled');
      } else {
        toast.error(data.error || 'Failed to update setting');
      }
    } catch {
      toast.error('Failed to update setting');
    } finally {
      setTogglingPoll(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Gmail? This will stop email monitoring.')) {
      return;
    }
    setDisconnecting(true);
    try {
      const response = await fetch('/api/email/disconnect', { method: 'DELETE' });
      if (response.ok) {
        setConnection(null);
        setRecentSyncs([]);
        toast.success('Gmail disconnected');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to disconnect');
      }
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      {/* Email Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <CardTitle>Email Monitoring</CardTitle>
          </div>
          <CardDescription>
            Connect your Gmail to automatically detect incoming NOI emails and import them into the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : connection ? (
            <>
              {/* Connected state */}
              <div className="flex items-center justify-between rounded-lg border bg-green-50 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">{connection.connected_email}</p>
                    <p className="text-sm text-green-700">
                      Connected {formatDate(connection.created_at)}
                    </p>
                  </div>
                </div>
                <Badge variant={connection.status === 'active' ? 'default' : 'destructive'}>
                  {connection.status}
                </Badge>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-gray-900">Auto-sync</p>
                  <p className="text-sm text-gray-500">
                    Automatically check for new NOI emails every 5 minutes
                  </p>
                </div>
                <Switch
                  checked={connection.auto_poll_enabled}
                  onCheckedChange={handleToggleAutoPoll}
                  disabled={togglingPoll}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-gray-900">Last synced</p>
                  <p className="text-sm text-gray-500">
                    {connection.last_synced_at
                      ? formatDate(connection.last_synced_at)
                      : 'Never synced'}
                    {connection.last_sync_message_count > 0 &&
                      ` (${connection.last_sync_message_count} found)`}
                  </p>
                </div>
                <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              </div>

              <Button
                onClick={handleDisconnect}
                disabled={disconnecting}
                variant="destructive"
                size="sm"
                className="w-full"
              >
                <Unplug className="mr-2 h-4 w-4" />
                {disconnecting ? 'Disconnecting...' : 'Disconnect Gmail'}
              </Button>

              {/* Sync History */}
              {recentSyncs.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">Recent Activity</h3>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {recentSyncs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-2 rounded border p-3 text-sm"
                      >
                        {entry.status === 'processed' ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                        ) : entry.status === 'failed' ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        ) : (
                          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-gray-900">
                            {entry.subject || 'No subject'}
                          </p>
                          <p className="truncate text-gray-500">
                            {entry.from_address || 'Unknown sender'}
                          </p>
                          {entry.error_message && (
                            <p className="text-xs text-red-600">{entry.error_message}</p>
                          )}
                          <p className="text-xs text-gray-400">{formatDate(entry.created_at)}</p>
                        </div>
                        {entry.violation_id && (
                          <a
                            href={`/dashboard/${entry.violation_id}`}
                            className="shrink-0 text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Not connected state */
            <div className="py-6 text-center">
              <Mail className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="mb-1 font-medium text-gray-900">No email connected</p>
              <p className="mb-4 text-sm text-gray-500">
                Connect your Gmail to automatically detect NOI emails from DC DOB.
              </p>
              <Button onClick={handleConnect} disabled={connecting}>
                <Mail className="mr-2 h-4 w-4" />
                {connecting ? 'Redirecting...' : 'Connect Gmail'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
