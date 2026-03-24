'use client';

import { useEffect, useState, useCallback } from 'react';
import { Nav } from '@/components/layout/nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, Users, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { AddContactDialog } from '@/components/contacts/add-contact-dialog';
import { EditContactDialog } from '@/components/contacts/edit-contact-dialog';
import type { Contact, ContactCategory } from '@/lib/types';
import { CONTACT_CATEGORY_COLORS, CONTACT_CATEGORY_LABELS } from '@/lib/types';
import { toast } from 'sonner';

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'TENANT', label: 'Tenant' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'OTHER', label: 'Other' },
];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (contact: Contact) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success(`${contact.full_name} deactivated`);
      setDeleteTarget(null);
      fetchContacts();
    } catch {
      toast.error('Failed to delete contact');
    }
    setDeleting(false);
  };

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category !== 'all') params.set('category', category);

    try {
      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, [search, category]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(fetchContacts, 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatLastTouch = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      <Nav title="Contacts" />
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Contacts ({total})
          </h2>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-10"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Contact list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border bg-gray-50" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16">
            <Users className="mb-4 h-12 w-12 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">No contacts yet</h3>
            <p className="mb-6 text-sm text-gray-500">
              {search || category !== 'all'
                ? 'No contacts match your filters.'
                : 'Add contractors, tenants, and government contacts to keep track of interactions.'}
            </p>
            {!search && category === 'all' && (
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Contact
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <Card key={contact.id} className="transition-all hover:shadow-md">
                <CardContent className="flex items-center gap-4 p-4">
                  {/* Clickable area → detail page */}
                  <Link href={`/contacts/${contact.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                      {contact.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>

                    {/* Name + company */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {contact.full_name}
                        </span>
                        <Badge className={`text-xs ${CONTACT_CATEGORY_COLORS[contact.category]}`}>
                          {CONTACT_CATEGORY_LABELS[contact.category]}
                        </Badge>
                      </div>
                      {contact.company && (
                        <p className="truncate text-xs text-gray-500">{contact.company}</p>
                      )}
                    </div>

                    {/* Contact info */}
                    <div className="hidden text-right text-xs text-gray-500 sm:block">
                      {contact.email && <p className="truncate">{contact.email}</p>}
                      {contact.phone && <p>{contact.phone}</p>}
                    </div>

                    {/* Last touch */}
                    <div className="shrink-0 text-right text-xs text-gray-400">
                      {formatLastTouch(contact.last_interaction_at)}
                    </div>
                  </Link>

                  {/* Action icons */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => { e.preventDefault(); setEditContact(contact); }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      title="Edit contact"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); setDeleteTarget(contact); }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Delete contact"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddContactDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={fetchContacts}
        defaultCategory={category !== 'all' ? category as ContactCategory : undefined}
      />

      {editContact && (
        <EditContactDialog
          open={!!editContact}
          onOpenChange={(open) => { if (!open) setEditContact(null); }}
          contact={editContact}
          onSuccess={() => { setEditContact(null); fetchContacts(); }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete {deleteTarget.full_name}?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will deactivate the contact. They won&apos;t appear in searches or the contractor dropdown.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-lg">Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)} disabled={deleting} className="rounded-lg">
                {deleting ? 'Deleting...' : 'Delete Contact'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
