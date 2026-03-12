'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { ContactCategory } from '@/lib/types';

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultCategory?: ContactCategory;
}

export function AddContactDialog({ open, onOpenChange, onSuccess, defaultCategory }: AddContactDialogProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ContactCategory>(defaultCategory || 'OTHER');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error('Name is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
          title: title.trim() || null,
          category,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create contact');
      }

      toast.success('Contact created');
      onOpenChange(false);
      resetForm();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create contact');
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setTitle('');
    setCategory(defaultCategory || 'OTHER');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Add Contact</DialogTitle>
        <div className="space-y-3 pt-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name *</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" type="email" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="202-555-1234" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Company</label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as ContactCategory)}
            >
              <option value="CONTRACTOR">Contractor</option>
              <option value="GOVERNMENT">Government</option>
              <option value="TENANT">Tenant</option>
              <option value="INTERNAL">Internal</option>
              <option value="VENDOR">Vendor</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any relevant notes..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Contact'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
