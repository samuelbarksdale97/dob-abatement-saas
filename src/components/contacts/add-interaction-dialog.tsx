'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { InteractionType } from '@/lib/types';

interface AddInteractionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onSuccess: () => void;
}

export function AddInteractionDialog({ open, onOpenChange, contactId, onSuccess }: AddInteractionDialogProps) {
  const [interactionType, setInteractionType] = useState<InteractionType>('NOTE');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [direction, setDirection] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interaction_type: interactionType,
          subject: subject.trim(),
          body: body.trim() || null,
          direction: direction || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to log interaction');
      }

      toast.success('Interaction logged');
      onOpenChange(false);
      setSubject('');
      setBody('');
      setDirection('');
      setInteractionType('NOTE');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log interaction');
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Log Interaction</DialogTitle>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={interactionType}
                onChange={(e) => setInteractionType(e.target.value as InteractionType)}
              >
                <option value="NOTE">Note</option>
                <option value="PHONE_CALL">Phone Call</option>
                <option value="EMAIL">Email</option>
                <option value="MEETING">Meeting</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Direction</label>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="">N/A</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Subject *</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Details</label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Full notes from the interaction..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Log Interaction'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
