'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mail,
  RefreshCw,
  Unplug,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Users,
  Plus,
  Shield,
  FlaskConical,
  Trash2,
  RotateCcw,
  X,
} from 'lucide-react';
import { Nav } from '@/components/layout/nav';

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
    <>
      <Nav title="Settings" />
      <div className="mx-auto max-w-3xl p-6">
        <Tabs defaultValue="gmail">
          <TabsList>
            <TabsTrigger value="gmail">Gmail</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="testing">Testing</TabsTrigger>
          </TabsList>

          <TabsContent value="gmail" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-600" />
                  <CardTitle>Email Monitoring</CardTitle>
                </div>
                <CardDescription>
                  Automatically detect incoming NOI emails and import them into the system.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="py-10 text-center">
                  <Mail className="mx-auto mb-3 h-12 w-12 text-slate-200" />
                  <Badge variant="outline" className="text-sm font-semibold text-slate-500 border-slate-300 px-4 py-1">
                    Coming Soon
                  </Badge>
                  <p className="mt-3 text-sm text-slate-400">
                    Gmail integration for automatic NOI detection is under development.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <TeamTab />
          </TabsContent>

          <TabsContent value="testing" className="mt-4">
            <TestingTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function TestingTab() {
  const [skipVerification, setSkipVerification] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSkipVerification(data.settings?.skip_photo_verification === true);
        }
      } catch {
        console.error('Failed to load settings');
      }
      setLoading(false);
    })();
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip_photo_verification: enabled }),
      });
      if (res.ok) {
        setSkipVerification(enabled);
        toast.success(enabled ? 'Photo verification disabled (QA mode)' : 'Photo verification re-enabled');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update setting');
      }
    } catch {
      toast.error('Failed to update setting');
    }
    setToggling(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-amber-600" />
          <CardTitle>QA & Testing</CardTitle>
        </div>
        <CardDescription>
          Settings that make it easier to test the full workflow without real data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium text-gray-900">Skip Photo Angle Verification</p>
            <p className="text-sm text-gray-500">
              When enabled, contractor photo uploads are auto-approved without AI verification.
            </p>
            {skipVerification && (
              <p className="mt-1 text-xs font-medium text-amber-600">
                Active — all contractor photos will be auto-approved
              </p>
            )}
          </div>
          <Switch
            checked={skipVerification}
            onCheckedChange={handleToggle}
            disabled={loading || toggling}
          />
        </div>
      </CardContent>
    </Card>
  );
}

type TeamMember = { id: string; full_name: string; email: string; role: string; active?: boolean; created_at: string };

function TeamTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [deactivated, setDeactivated] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Array<{ id: string; email: string; role: string; status: string; expires_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('PROJECT_MANAGER');
  const [inviting, setInviting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/team');
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setDeactivated(data.deactivated || []);
        setCurrentUserId(data.currentUserId || null);
        setInvitations(data.invitations || []);
      } else if (res.status === 403) {
        setError('Only Owners and Admins can manage the team. Ensure the Supabase Auth Hook (custom_access_token_hook) is enabled in Dashboard → Authentication → Hooks.');
      } else {
        setError('Failed to load team data.');
      }
    } catch {
      setError('Failed to load team data.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Email is required');
      return;
    }
    setInviting(true);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to invite');
      }
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      fetchTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to invite');
    }
    setInviting(false);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/team/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change role');
      }
      toast.success('Role updated');
      fetchTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  const handleDeactivate = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.full_name}? They will lose access immediately. You can reactivate them later.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/team/${member.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove member');
      }
      toast.success(`${member.full_name} removed`);
      fetchTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleReactivate = async (member: TeamMember) => {
    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reactivate member');
      }
      toast.success(`${member.full_name} reactivated`);
      fetchTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate member');
    }
  };

  const handleRevoke = async (inv: { id: string; email: string }) => {
    if (!window.confirm(`Revoke the pending invitation for ${inv.email}? Their signup link will stop working.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/team/invite/${inv.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke invitation');
      }
      toast.success(`Invitation to ${inv.email} revoked`);
      fetchTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invitation');
    }
  };

  const ownerCount = members.filter((m) => m.role === 'OWNER').length;

  const roleColors: Record<string, string> = {
    OWNER: 'bg-purple-100 text-purple-800',
    ADMIN: 'bg-blue-100 text-blue-800',
    PROJECT_MANAGER: 'bg-green-100 text-green-800',
    CONTRACTOR: 'bg-orange-100 text-orange-800',
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-gray-50" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-500">
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <CardTitle>Invite Team Member</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder="email@example.com"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="PROJECT_MANAGER">Project Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
            <Button onClick={handleInvite} disabled={inviting}>
              <Plus className="mr-2 h-4 w-4" />
              {inviting ? 'Sending...' : 'Invite'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                  {member.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{member.full_name}</p>
                  <p className="text-xs text-gray-500">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={roleColors[member.role] || 'bg-gray-100 text-gray-700'}>
                  <Shield className="mr-1 h-3 w-3" />
                  {member.role.replace('_', ' ')}
                </Badge>
                <select
                  className="rounded border border-gray-200 px-2 py-1 text-xs"
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value)}
                >
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                  <option value="CONTRACTOR">Contractor</option>
                </select>
                {member.id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => handleDeactivate(member)}
                    disabled={member.role === 'OWNER' && ownerCount <= 1}
                    title={member.role === 'OWNER' && ownerCount <= 1 ? 'Cannot remove the last owner' : 'Remove member'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Deactivated members */}
      {deactivated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deactivated ({deactivated.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deactivated.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border border-dashed p-3 opacity-75">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-400">
                    {member.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 line-through">{member.full_name}</p>
                    <p className="text-xs text-gray-400">{member.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => handleReactivate(member)}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reactivate
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-dashed p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.email}</p>
                  <p className="text-xs text-gray-500">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/team/invite/resend`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ invitation_id: inv.id }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        toast.success(`Invitation resent to ${inv.email}`);
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to resend invitation');
                      }
                    }}
                  >
                    <Mail className="h-3 w-3" />
                    Resend
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => handleRevoke(inv)}
                  >
                    <X className="h-3 w-3" />
                    Revoke
                  </Button>
                  <Badge variant="outline" className="text-xs">
                    {inv.role.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
