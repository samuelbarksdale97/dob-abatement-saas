'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Mail, Phone, Building2, MessageSquare, Zap, PhoneCall, Calendar } from 'lucide-react';
import Link from 'next/link';
import { AddInteractionDialog } from '@/components/contacts/add-interaction-dialog';
import type { Contact, ContactInteraction, ContactEntityLink, InteractionType } from '@/lib/types';
import { CONTACT_CATEGORY_COLORS, CONTACT_CATEGORY_LABELS } from '@/lib/types';

const INTERACTION_ICONS: Record<InteractionType, typeof MessageSquare> = {
  NOTE: MessageSquare,
  PHONE_CALL: PhoneCall,
  EMAIL: Mail,
  MEETING: Calendar,
  SYSTEM_EVENT: Zap,
};

const INTERACTION_LABELS: Record<InteractionType, string> = {
  NOTE: 'Note',
  PHONE_CALL: 'Phone Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  SYSTEM_EVENT: 'System',
};

export default function ContactDetailPage() {
  const params = useParams();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [interactions, setInteractions] = useState<ContactInteraction[]>([]);
  const [entityLinks, setEntityLinks] = useState<ContactEntityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [addInteractionOpen, setAddInteractionOpen] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setContact(data.contact);
      setInteractions(data.interactions || []);
      setEntityLinks(data.entity_links || []);
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div>
        <Nav title="Contact Detail" />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div>
        <Nav title="Contact Not Found" />
        <div className="p-6 text-center text-gray-500">Contact not found.</div>
      </div>
    );
  }

  return (
    <div>
      <Nav title={contact.full_name} />
      <div className="space-y-6 p-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/contacts" className="hover:text-gray-700">Contacts</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900">{contact.full_name}</span>
        </nav>

        {/* Info card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-medium text-gray-600">
                  {contact.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">{contact.full_name}</h2>
                    <Badge className={CONTACT_CATEGORY_COLORS[contact.category]}>
                      {CONTACT_CATEGORY_LABELS[contact.category]}
                    </Badge>
                  </div>
                  {(contact.company || contact.title) && (
                    <p className="mt-0.5 text-sm text-gray-500">
                      {[contact.title, contact.company].filter(Boolean).join(' at ')}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                    {contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {contact.email}
                      </span>
                    )}
                    {contact.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {contact.phone}
                      </span>
                    )}
                  </div>
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {contact.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  {contact.notes && (
                    <p className="mt-2 text-sm text-gray-600">{contact.notes}</p>
                  )}
                </div>
              </div>
              <Button size="sm" onClick={() => setAddInteractionOpen(true)}>
                Log Interaction
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline ({interactions.length})</TabsTrigger>
            <TabsTrigger value="linked">Linked Entities ({entityLinks.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            {interactions.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">No interactions logged yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {interactions.map((interaction) => {
                  const Icon = INTERACTION_ICONS[interaction.interaction_type] || MessageSquare;
                  return (
                    <Card key={interaction.id}>
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="mt-0.5 rounded-full bg-gray-100 p-2">
                          <Icon className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {interaction.subject || INTERACTION_LABELS[interaction.interaction_type]}
                            </span>
                            {interaction.direction && (
                              <Badge variant="outline" className="text-xs">
                                {interaction.direction}
                              </Badge>
                            )}
                          </div>
                          {interaction.body && (
                            <p className="mt-1 text-sm text-gray-600 line-clamp-3">{interaction.body}</p>
                          )}
                          <p className="mt-1 text-xs text-gray-400">
                            {formatTime(interaction.occurred_at)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="linked" className="mt-4">
            {entityLinks.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
                <Building2 className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">Not linked to any properties, violations, or work orders yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entityLinks.map((link) => (
                  <Card key={link.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <span className="text-sm font-medium capitalize">{link.entity_type.replace('_', ' ')}</span>
                        {link.role && (
                          <Badge variant="outline" className="ml-2 text-xs">{link.role}</Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{link.entity_id.slice(0, 8)}...</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AddInteractionDialog
        open={addInteractionOpen}
        onOpenChange={setAddInteractionOpen}
        contactId={contactId}
        onSuccess={fetchDetail}
      />
    </div>
  );
}
