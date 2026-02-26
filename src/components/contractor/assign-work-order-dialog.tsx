'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Violation, Contractor } from '@/lib/types';
import { UserPlus } from 'lucide-react';

interface AssignWorkOrderDialogProps {
  violation: Violation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AssignWorkOrderDialog({
  violation,
  open,
  onOpenChange,
  onSuccess,
}: AssignWorkOrderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [mode, setMode] = useState<'select' | 'new'>('select');
  const [selectedContractorId, setSelectedContractorId] = useState<string>('');
  const [formData, setFormData] = useState({
    contractor_name: '',
    contractor_email: '',
    contractor_phone: '',
    due_date: violation.abatement_deadline || '',
    notes: '',
  });

  // Fetch contractors when dialog opens
  useEffect(() => {
    if (open) {
      fetch('/api/contractors')
        .then((res) => res.json())
        .then((data) => {
          const list = data.contractors || [];
          setContractors(list);
          // If no existing contractors, default to new entry mode
          if (list.length === 0) setMode('new');
          else setMode('select');
        })
        .catch(() => setContractors([]));
    } else {
      // Reset state when dialog closes
      setSelectedContractorId('');
      setMode('select');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.contractor_name.trim()) {
      toast.error('Contractor name is required');
      return;
    }

    if (!formData.contractor_email.trim()) {
      toast.error('Email is required');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.contractor_email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!formData.due_date) {
      toast.error('Due date is required');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/work-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          violation_id: violation.id,
          ...formData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign contractor');
      }

      // Copy magic link to clipboard
      if (data.magic_link) {
        await navigator.clipboard.writeText(data.magic_link);
      }

      toast.success(`Contractor assigned. Link: ${data.magic_link}`, {
        duration: 5000,
      });

      // Reset form and dropdown state
      setSelectedContractorId('');
      setFormData({
        contractor_name: '',
        contractor_email: '',
        contractor_phone: '',
        due_date: violation.abatement_deadline || '',
        notes: '',
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to assign contractor:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to assign contractor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Assign Contractor</DialogTitle>
            <DialogDescription>
              Send a work order assignment to a contractor. They will receive an email with a magic
              link to view the violation details and upload photos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Contractor Selection: Dropdown or New Entry */}
            {contractors.length > 0 && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Contractor</Label>
                  {mode === 'select' ? (
                    <button
                      type="button"
                      className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                      onClick={() => {
                        setMode('new');
                        setSelectedContractorId('');
                        setFormData((prev) => ({
                          ...prev,
                          contractor_name: '',
                          contractor_email: '',
                          contractor_phone: '',
                        }));
                      }}
                    >
                      <UserPlus className="mr-1 h-3 w-3" />
                      Add New
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-sm text-blue-600 hover:text-blue-800"
                      onClick={() => setMode('select')}
                    >
                      Select Existing
                    </button>
                  )}
                </div>

                {mode === 'select' && (
                  <Select
                    value={selectedContractorId}
                    onValueChange={(id) => {
                      setSelectedContractorId(id);
                      const contractor = contractors.find((c) => c.id === id);
                      if (contractor) {
                        setFormData((prev) => ({
                          ...prev,
                          contractor_name: contractor.name,
                          contractor_email: contractor.email,
                          contractor_phone: contractor.phone || '',
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a contractor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contractors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.email})
                          {c.total_assignments > 0 && ` — ${c.total_assignments} assignments`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Manual entry fields - shown when mode is 'new' OR when selecting (to allow edits) */}
            {(mode === 'new' || contractors.length === 0) && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="contractor_name">
                    Contractor Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contractor_name"
                    value={formData.contractor_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, contractor_name: e.target.value }))
                    }
                    placeholder="Alex Johnson"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="contractor_email">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contractor_email"
                    type="email"
                    value={formData.contractor_email}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, contractor_email: e.target.value }))
                    }
                    placeholder="alex@example.com"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="contractor_phone">Phone (optional)</Label>
                  <Input
                    id="contractor_phone"
                    type="tel"
                    value={formData.contractor_phone}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, contractor_phone: e.target.value }))
                    }
                    placeholder="555-1234"
                  />
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="due_date">
                Due Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, due_date: e.target.value }))
                }
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Any special instructions or notes for the contractor..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Assigning...' : 'Assign Contractor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
