'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ChevronRight, User, Phone, Edit2, Building2,
  AlertTriangle, Clock, CheckCircle2, FileText,
  ArrowRight, DollarSign, Trash2, X,
} from 'lucide-react';
import Link from 'next/link';
import { STATUS_COLORS, STATUS_LABELS, getDaysRemaining, getUrgencyColor } from '@/lib/status-transitions';
import type { Unit, Violation, ViolationStatus } from '@/lib/types';

// ── Action Grouping ──────────────────────────────────────────────

const NEEDS_ACTION_STATUSES: ViolationStatus[] = [
  'AWAITING_PHOTOS', 'READY_FOR_SUBMISSION', 'ADDITIONAL_INFO_REQUESTED', 'REJECTED',
];
const IN_PROGRESS_STATUSES: ViolationStatus[] = [
  'ASSIGNED', 'IN_PROGRESS', 'PHOTOS_UPLOADED', 'SUBMITTED',
];
const INACTIVE_STATUSES: ViolationStatus[] = [
  'NEW', 'PARSING', 'PARSED', 'APPROVED', 'CLOSED',
];

function getActionLabel(status: ViolationStatus): string {
  switch (status) {
    case 'AWAITING_PHOTOS': return 'Upload photos';
    case 'READY_FOR_SUBMISSION': return 'Review & submit to DOB';
    case 'ADDITIONAL_INFO_REQUESTED': return 'Respond to DOB request';
    case 'REJECTED': return 'Fix & resubmit';
    default: return '';
  }
}


// ── Violation Card Component (compact grid style) ────────────────

function ViolationCard({ v, onDelete }: { v: Violation; onDelete?: (id: string) => void }) {
  const days = getDaysRemaining(v.abatement_deadline);
  const urgencyColor = getUrgencyColor(v.abatement_deadline, v.status as ViolationStatus);
  const actionLabel = getActionLabel(v.status as ViolationStatus);

  return (
    <Link href={`/dashboard/${v.id}`}>
      <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] border-slate-200/60 rounded-2xl group bg-white h-full">
        <CardContent className="p-5 flex flex-col h-full">
          {/* Top: Notice ID + Priority */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
              {v.notice_id || 'Pending NOI'}
            </span>
            {v.priority && v.priority <= 2 && (
              <Badge variant="outline" className={`text-[0.6rem] font-bold rounded-md shrink-0 ${
                v.priority === 1 ? 'border-red-200 text-red-700 bg-red-50' : 'border-orange-200 text-orange-700 bg-orange-50'
              }`}>
                P{v.priority}
              </Badge>
            )}
          </div>

          {/* Fines (prominent) */}
          {(v.total_fines ?? 0) > 0 && (
            <span className="text-lg font-black tracking-tight text-slate-900 mb-1">
              ${(v.total_fines ?? 0).toLocaleString()}
            </span>
          )}

          {/* Action hint */}
          {actionLabel && (
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowRight className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold text-amber-700">{actionLabel}</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer: Status + Deadline + Delete */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3">
            <Badge
              className={`text-[0.6rem] uppercase tracking-wider font-bold rounded-md ${STATUS_COLORS[v.status as ViolationStatus] || ''}`}
            >
              {STATUS_LABELS[v.status as ViolationStatus] || v.status}
            </Badge>
            <div className="flex items-center gap-2">
              {days !== null && !['APPROVED', 'CLOSED'].includes(v.status) && (
                <span className={`text-xs font-medium ${urgencyColor}`}>
                  {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                </span>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(v.id); }}
                  className="rounded-lg p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete violation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Tab Definitions ──────────────────────────────────────────────

type ViolationTab = 'action' | 'progress' | 'resolved';

const TAB_CONFIG: Record<ViolationTab, { label: string; icon: React.ElementType; emptyText: string; color: string }> = {
  action:   { label: 'Needs Action',  icon: AlertTriangle, emptyText: 'No violations need your input right now.',        color: 'text-amber-600 border-amber-500' },
  progress: { label: 'In Progress',   icon: Clock,         emptyText: 'No violations currently in progress.',            color: 'text-blue-600 border-blue-500' },
  resolved: { label: 'Resolved',      icon: CheckCircle2,  emptyText: 'No resolved or inactive violations yet.',         color: 'text-emerald-600 border-emerald-500' },
};

// ── Main Page ────────────────────────────────────────────────────

export default function UnitDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;

  const router = useRouter();
  const [unit, setUnit] = useState<Unit | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    is_vacant: true,
    occupant_name: '',
    occupant_phone: '',
    notes: '',
  });
  const [editSaving, setEditSaving] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<ViolationTab>('action');

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<'unit' | 'violation' | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUnit = useCallback(async () => {
    setLoading(true);
    try {
      const [unitsRes, violationsRes] = await Promise.all([
        fetch(`/api/properties/${propertyId}/units`),
        fetch(`/api/violations?unit_id=${unitId}`),
      ]);
      const unitsData = await unitsRes.json();
      const found = (unitsData.units || []).find((u: Unit) => u.id === unitId);
      setUnit(found || null);

      const violationsData = await violationsRes.json();
      setViolations(violationsData.violations || []);
    } catch (error) {
      console.error('Failed to fetch unit:', error);
    }
    setLoading(false);
  }, [propertyId, unitId]);

  useEffect(() => {
    fetchUnit();
  }, [fetchUnit]);

  const openEditModal = () => {
    if (unit) {
      setEditForm({
        is_vacant: unit.is_vacant ?? true,
        occupant_name: unit.occupant_name || '',
        occupant_phone: unit.occupant_phone || '',
        notes: unit.notes || '',
      });
      setEditOpen(true);
    }
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditOpen(false);
        fetchUnit();
      }
    } catch (error) {
      console.error('Failed to save unit:', error);
    }
    setEditSaving(false);
  };

  const handleDeleteUnit = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/units/${unitId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push(`/properties/${propertyId}`);
      }
    } catch (error) {
      console.error('Failed to delete unit:', error);
    }
    setDeleting(false);
    setDeleteConfirm(null);
  };

  const handleDeleteViolation = async (violationId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/violations/${violationId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchUnit();
      }
    } catch (error) {
      console.error('Failed to delete violation:', error);
    }
    setDeleting(false);
    setDeleteConfirm(null);
    setDeleteTargetId(null);
  };

  if (loading) {
    return (
      <div>
        <Nav title="Unit Detail" />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div>
        <Nav title="Unit Not Found" />
        <div className="p-6 text-center text-gray-500">Unit not found.</div>
      </div>
    );
  }

  // Group violations by action category
  const needsAction = violations
    .filter(v => NEEDS_ACTION_STATUSES.includes(v.status as ViolationStatus))
    .sort((a, b) => {
      const aDays = getDaysRemaining(a.abatement_deadline) ?? 999;
      const bDays = getDaysRemaining(b.abatement_deadline) ?? 999;
      return aDays - bDays;
    });

  const inProgress = violations
    .filter(v => IN_PROGRESS_STATUSES.includes(v.status as ViolationStatus))
    .sort((a, b) => (a.priority || 3) - (b.priority || 3));

  const inactive = violations
    .filter(v => INACTIVE_STATUSES.includes(v.status as ViolationStatus))
    .sort((a, b) => {
      // Show NEW/PARSING/PARSED before APPROVED/CLOSED
      const order: Record<string, number> = { NEW: 0, PARSING: 1, PARSED: 2, APPROVED: 3, CLOSED: 4 };
      return (order[a.status] ?? 5) - (order[b.status] ?? 5);
    });

  // Summary metrics
  const totalFines = violations.reduce((sum, v) => sum + (v.total_fines ?? 0), 0);
  const overdueCount = violations.filter(v => {
    const days = getDaysRemaining(v.abatement_deadline);
    return days !== null && days < 0 && !['APPROVED', 'CLOSED'].includes(v.status);
  }).length;

  return (
    <div>
      <Nav title={`Unit ${unit.unit_number}`} />
      <div className="space-y-6 p-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          <Link href="/dashboard" className="hover:text-slate-700 transition-colors">Portfolio</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`/properties/${propertyId}`} className="hover:text-slate-700 transition-colors">Property</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-slate-900 tracking-wider">Unit {unit.unit_number}</span>
        </nav>

        {/* Unit info card */}
        <Card className="border-slate-200/60 shadow-sm rounded-2xl bg-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4">
             <Building2 className="h-48 w-48 text-slate-900" />
          </div>
          <CardContent className="p-8 relative z-10">
            <div className="mb-6 flex items-start justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">Unit {unit.unit_number}</h2>
                  <Badge variant={unit.is_vacant ? 'secondary' : 'outline'} className="text-[0.65rem] uppercase tracking-wider font-bold rounded-md">
                    {unit.is_vacant ? 'Vacant' : 'Occupied'}
                  </Badge>
                </div>
                {/* Quick stats under title */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {violations.length} violation{violations.length !== 1 ? 's' : ''}
                  </span>
                  {totalFines > 0 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      ${totalFines.toLocaleString()}
                    </span>
                  )}
                  {overdueCount > 0 && (
                    <span className="flex items-center gap-1 text-red-600 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {overdueCount} overdue
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={openEditModal} className="rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm transition-all hover:bg-slate-50">
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit Details
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeleteConfirm('unit')}
                  className="rounded-xl border-red-200 text-red-600 hover:text-red-900 hover:bg-red-50 shadow-sm transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="rounded-lg p-2 bg-white shadow-sm border border-slate-100">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Occupant</span>
                    <span className="text-sm font-medium text-slate-900">{unit.occupant_name || 'Not provided'}</span>
                  </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="rounded-lg p-2 bg-white shadow-sm border border-slate-100">
                    <Phone className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</span>
                    <span className="text-sm font-medium text-slate-900">{unit.occupant_phone || 'Not provided'}</span>
                  </div>
              </div>
            </div>

            {unit.notes && (
              <div className="mt-6 p-4 rounded-xl border border-slate-100 bg-amber-50/30">
                <p className="text-sm font-medium text-slate-600 leading-relaxed italic">&ldquo;{unit.notes}&rdquo;</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Violations tabbed view */}
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {(Object.entries(TAB_CONFIG) as [ViolationTab, typeof TAB_CONFIG[ViolationTab]][]).map(([key, config]) => {
              const Icon = config.icon;
              const count = key === 'action' ? needsAction.length : key === 'progress' ? inProgress.length : inactive.length;
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    isActive
                      ? config.color
                      : 'text-slate-400 border-transparent hover:text-slate-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {config.label}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-slate-100 text-slate-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {(() => {
            const tabViolations = activeTab === 'action' ? needsAction : activeTab === 'progress' ? inProgress : inactive;
            const config = TAB_CONFIG[activeTab];

            if (tabViolations.length === 0) {
              return (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                  <div className="mx-auto flex max-w-[360px] flex-col items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-3">
                      <config.icon className="h-7 w-7 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">{config.emptyText}</p>
                    {violations.length === 0 && (
                      <>
                        <p className="mt-2 text-xs text-slate-400">
                          Violations will appear here once linked through an uploaded NOI.
                        </p>
                        <Link href="/parse">
                          <Button variant="outline" className="rounded-xl mt-4 bg-white" size="sm">
                            Upload New NOI
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tabViolations.map((v) => (
                  <ViolationCard
                    key={v.id}
                    v={v}
                    onDelete={(id: string) => { setDeleteTargetId(id); setDeleteConfirm('violation'); }}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Edit Details Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Edit Unit Details</h3>
              <button onClick={() => setEditOpen(false)} className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold text-slate-700">Occupancy Status</Label>
                <div className="flex gap-2 mt-1.5">
                  <Button
                    size="sm"
                    variant={!editForm.is_vacant ? 'default' : 'outline'}
                    onClick={() => setEditForm(f => ({ ...f, is_vacant: false }))}
                    className="rounded-lg flex-1"
                  >
                    Occupied
                  </Button>
                  <Button
                    size="sm"
                    variant={editForm.is_vacant ? 'default' : 'outline'}
                    onClick={() => setEditForm(f => ({ ...f, is_vacant: true, occupant_name: '', occupant_phone: '' }))}
                    className="rounded-lg flex-1"
                  >
                    Vacant
                  </Button>
                </div>
              </div>

              {!editForm.is_vacant && (
                <>
                  <div>
                    <Label htmlFor="occupant_name" className="text-sm font-semibold text-slate-700">Occupant Name</Label>
                    <Input
                      id="occupant_name"
                      value={editForm.occupant_name}
                      onChange={e => setEditForm(f => ({ ...f, occupant_name: e.target.value }))}
                      placeholder="Full name"
                      className="mt-1.5 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label htmlFor="occupant_phone" className="text-sm font-semibold text-slate-700">Contact Phone</Label>
                    <Input
                      id="occupant_phone"
                      value={editForm.occupant_phone}
                      onChange={e => setEditForm(f => ({ ...f, occupant_phone: e.target.value }))}
                      placeholder="(202) 555-0100"
                      className="mt-1.5 rounded-lg"
                    />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="notes" className="text-sm font-semibold text-slate-700">Notes</Label>
                <textarea
                  id="notes"
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes about this unit..."
                  rows={3}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-lg">Cancel</Button>
              <Button onClick={saveEdit} disabled={editSaving} className="rounded-lg">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Unit Confirmation */}
      {deleteConfirm === 'unit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Unit {unit.unit_number}?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently delete this unit and all {violations.length} associated violation{violations.length !== 1 ? 's' : ''}, including their photos, work orders, and submission data. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="rounded-lg">Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteUnit} disabled={deleting} className="rounded-lg">
                {deleting ? 'Deleting...' : 'Delete Unit'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Violation Confirmation */}
      {deleteConfirm === 'violation' && deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Violation?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently delete this violation and all associated data (items, photos, work orders). This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setDeleteConfirm(null); setDeleteTargetId(null); }} className="rounded-lg">Cancel</Button>
              <Button variant="destructive" onClick={() => handleDeleteViolation(deleteTargetId)} disabled={deleting} className="rounded-lg">
                {deleting ? 'Deleting...' : 'Delete Violation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
