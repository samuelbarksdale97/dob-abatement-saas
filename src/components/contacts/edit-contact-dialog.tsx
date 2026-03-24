'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Contact, ContactCategory } from '@/lib/types';

interface EditContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  onSuccess: (updated: Contact) => void;
}

export function EditContactDialog({ open, onOpenChange, contact, onSuccess }: EditContactDialogProps) {
  const [fullName, setFullName] = useState(contact.full_name);
  const [email, setEmail] = useState(contact.email || '');
  const [phone, setPhone] = useState(contact.phone || '');
  const [company, setCompany] = useState(contact.company || '');
  const [title, setTitle] = useState(contact.title || '');
  const [category, setCategory] = useState<ContactCategory>(contact.category);
  const [notes, setNotes] = useState(contact.notes || '');
  const [submitting, setSubmitting] = useState(false);

  // Re-sync form if the contact prop changes (e.g. after a refresh)
  useEffect(() => {
    setFullName(contact.full_name);
    setEmail(contact.email || '');
    setPhone(contact.phone || '');
    setCompany(contact.company || '');
    setTitle(contact.title || '');
    setCategory(contact.category);
    setNotes(contact.notes || '');
  }, [contact]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error('Name is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
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
        throw new Error(data.error || 'Failed to update contact');
      }

      const data = await res.json();
      toast.success('Contact updated');
      onOpenChange(false);
      onSuccess(data.contact);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update contact');
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Edit Contact</DialogTitle>
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
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
