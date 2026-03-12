'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Plus, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Submission, SubmissionResponse } from '@/lib/types';

interface SubmissionTabProps {
  violationId: string;
  violationStatus: string;
}

const RESPONSE_STATUS_CONFIG: Record<SubmissionResponse, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
  ADDITIONAL_INFO_REQUESTED: { label: 'Info Requested', color: 'bg-orange-100 text-orange-800', icon: AlertTriangle },
};

export function SubmissionTab({ violationId, violationStatus }: SubmissionTabProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // For updating DOB response
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<SubmissionResponse>('PENDING');
  const [responseNotes, setResponseNotes] = useState('');

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/submissions?violation_id=${violationId}`);
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, [violationId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleCreateSubmission = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          violation_id: violationId,
          confirmation_number: confirmationNumber || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create submission');
      }

      toast.success('Submission recorded');
      setShowNewForm(false);
      setConfirmationNumber('');
      fetchSubmissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create submission');
    }
    setSubmitting(false);
  };

  const handleUpdateResponse = async (submissionId: string) => {
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_status: responseStatus,
          response_notes: responseNotes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }

      toast.success('Response recorded');
      setUpdatingId(null);
      setResponseStatus('PENDING');
      setResponseNotes('');
      fetchSubmissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const canSubmit = ['READY_FOR_SUBMISSION', 'SUBMITTED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED'].includes(violationStatus);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with action button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {submissions.length === 0
            ? 'No submissions yet.'
            : `${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`}
        </p>
        {canSubmit && !showNewForm && (
          <Button size="sm" onClick={() => setShowNewForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record Submission
          </Button>
        )}
      </div>

      {/* New submission form */}
      {showNewForm && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h4 className="text-sm font-medium">Record DOB Submission</h4>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                Confirmation Number (optional)
              </label>
              <Input
                placeholder="e.g., DOB-2026-12345"
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreateSubmission}
                disabled={submitting}
              >
                {submitting ? 'Recording...' : 'Record Submission'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowNewForm(false);
                  setConfirmationNumber('');
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submission history */}
      {submissions.map((submission) => {
        const config = RESPONSE_STATUS_CONFIG[submission.response_status];
        const StatusIcon = config.icon;
        const isUpdating = updatingId === submission.id;

        return (
          <Card key={submission.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 text-gray-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {submission.confirmation_number || 'No confirmation #'}
                      </span>
                      <Badge className={`text-xs ${config.color}`}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Submitted {new Date(submission.submitted_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                    {submission.response_notes && (
                      <p className="mt-2 text-sm text-gray-600">
                        {submission.response_notes}
                      </p>
                    )}
                    {submission.responded_at && (
                      <p className="mt-1 text-xs text-gray-400">
                        DOB responded {new Date(submission.responded_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                </div>
                {submission.response_status === 'PENDING' && !isUpdating && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUpdatingId(submission.id);
                      setResponseStatus('PENDING');
                      setResponseNotes('');
                    }}
                  >
                    Record Response
                  </Button>
                )}
              </div>

              {/* Update response form */}
              {isUpdating && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <h5 className="text-sm font-medium">DOB Response</h5>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Status</label>
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={responseStatus}
                      onChange={(e) => setResponseStatus(e.target.value as SubmissionResponse)}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="APPROVED">Approved</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="ADDITIONAL_INFO_REQUESTED">Additional Info Requested</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Notes (optional)</label>
                    <Input
                      placeholder="e.g., DOB inspector approved on-site"
                      value={responseNotes}
                      onChange={(e) => setResponseNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleUpdateResponse(submission.id)}>
                      Save Response
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setUpdatingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Empty state hint */}
      {submissions.length === 0 && !showNewForm && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">
            {canSubmit
              ? 'Ready to submit. Generate the evidence PDF, then record your submission here.'
              : 'Submissions will be available once the violation is ready for submission.'}
          </p>
        </div>
      )}
    </div>
  );
}
