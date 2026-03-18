'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronRight, ChevronDown, User, Phone, Edit2, Building2,
  AlertTriangle, Clock, Camera, Send, CheckCircle2, FileText,
  ArrowRight, DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { STATUS_COLORS, STATUS_LABELS, getDaysRemaining, getUrgencyColor } from '@/lib/status-transitions';
import type { Unit, Violation, ViolationStatus } from '@/lib/types';

// ── Phase & Action Grouping ──────────────────────────────────────

type Phase = 'intake' | 'active' | 'submission' | 'resolution';

const PHASE_STATUSES: Record<Phase, ViolationStatus[]> = {
  intake: ['NEW', 'PARSING', 'PARSED'],
  active: ['ASSIGNED', 'IN_PROGRESS', 'AWAITING_PHOTOS', 'PHOTOS_UPLOADED'],
  submission: ['READY_FOR_SUBMISSION', 'SUBMITTED'],
  resolution: ['APPROVED', 'REJECTED', 'ADDITIONAL_INFO_REQUESTED', 'CLOSED'],
};

const PHASE_META: Record<Phase, { label: string; color: string; bgColor: string }> = {
  intake: { label: 'Intake', color: 'bg-slate-400', bgColor: 'bg-slate-50' },
  active: { label: 'Active Work', color: 'bg-yellow-500', bgColor: 'bg-yellow-50' },
  submission: { label: 'Submission', color: 'bg-teal-500', bgColor: 'bg-teal-50' },
  resolution: { label: 'Resolution', color: 'bg-emerald-500', bgColor: 'bg-emerald-50' },
};

// Action-oriented grouping (Option 3)
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

function getPhase(status: ViolationStatus): Phase {
  for (const [phase, statuses] of Object.entries(PHASE_STATUSES)) {
    if (statuses.includes(status)) return phase as Phase;
  }
  return 'intake';
}

// ── Health Bar Component ─────────────────────────────────────────

function HealthBar({ violations }: { violations: Violation[] }) {
  const phases: Phase[] = ['intake', 'active', 'submission', 'resolution'];
  const phaseCounts = phases.map(p => ({
    phase: p,
    count: violations.filter(v => PHASE_STATUSES[p].includes(v.status as ViolationStatus)).length,
  }));
  const total = violations.length;

  // Compute verdict
  const overdueCount = violations.filter(v => {
    const days = getDaysRemaining(v.abatement_deadline);
    return days !== null && days < 0 && !['APPROVED', 'CLOSED'].includes(v.status);
  }).length;
  const needsActionCount = violations.filter(v =>
    NEEDS_ACTION_STATUSES.includes(v.status as ViolationStatus)
  ).length;
  const resolvedCount = violations.filter(v =>
    ['APPROVED', 'CLOSED'].includes(v.status)
  ).length;

  let verdictText: string;
  let verdictColor: string;
  if (overdueCount > 0) {
    verdictText = `${overdueCount} overdue — action required`;
    verdictColor = 'text-red-600';
  } else if (needsActionCount > 0) {
    verdictText = `${needsActionCount} need${needsActionCount === 1 ? 's' : ''} your input`;
    verdictColor = 'text-amber-600';
  } else if (resolvedCount === total) {
    verdictText = 'All resolved';
    verdictColor = 'text-emerald-600';
  } else {
    verdictText = 'All on track';
    verdictColor = 'text-emerald-600';
  }

  return (
    <Card className="border-slate-200/60 rounded-2xl bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-700">Pipeline Status</span>
          <span className={`text-sm font-bold ${verdictColor}`}>{verdictText}</span>
        </div>

        {/* Phase bar */}
        <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mb-3">
          {phaseCounts.map(({ phase, count }) => {
            if (count === 0) return null;
            const widthPercent = (count / total) * 100;
            return (
              <div
                key={phase}
                className={`${PHASE_META[phase].color} transition-all duration-500`}
                style={{ width: `${widthPercent}%` }}
                title={`${PHASE_META[phase].label}: ${count}`}
              />
            );
          })}
        </div>

        {/* Phase legend */}
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {phaseCounts.map(({ phase, count }) => (
            <div key={phase} className="flex items-center gap-1.5">
              <div className={`h-2.5 w-2.5 rounded-full ${PHASE_META[phase].color}`} />
              <span className="text-xs text-slate-500">
                {PHASE_META[phase].label}
              </span>
              <span className="text-xs font-bold text-slate-700">{count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Violation Row Component ──────────────────────────────────────

function ViolationRow({ v, showAction }: { v: Violation; showAction?: boolean }) {
  const days = getDaysRemaining(v.abatement_deadline);
  const urgencyColor = getUrgencyColor(v.abatement_deadline, v.status as ViolationStatus);
  const actionLabel = showAction ? getActionLabel(v.status as ViolationStatus) : null;

  return (
    <Link href={`/dashboard/${v.id}`}>
      <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border-slate-200/60 rounded-xl group bg-white">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
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
              {actionLabel && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ArrowRight className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-amber-700">{actionLabel}</span>
                </div>
              )}
              <span className="text-xs text-slate-400 truncate block">
                {v.infraction_address || 'Address pending'}
              </span>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge
                className={`text-[0.6rem] uppercase tracking-wider font-bold rounded-md ${STATUS_COLORS[v.status as ViolationStatus] || ''}`}
              >
                {STATUS_LABELS[v.status as ViolationStatus] || v.status}
              </Badge>
              <div className="flex items-center gap-2">
                {(v.total_fines ?? 0) > 0 && (
                  <span className="text-xs font-semibold text-slate-500">
                    ${(v.total_fines ?? 0).toLocaleString()}
                  </span>
                )}
                {days !== null && !['APPROVED', 'CLOSED'].includes(v.status) && (
                  <span className={`text-xs ${urgencyColor}`}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Collapsible Section ──────────────────────────────────────────

function ViolationSection({
  title,
  icon: Icon,
  violations,
  showAction,
  defaultOpen,
  accentColor,
}: {
  title: string;
  icon: React.ElementType;
  violations: Violation[];
  showAction?: boolean;
  defaultOpen: boolean;
  accentColor: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (violations.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-2 group/section"
      >
        <div className={`rounded-lg p-1.5 ${accentColor}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-bold text-slate-800 flex-1">
          {title}
          <span className="ml-1.5 text-xs font-semibold text-slate-400">({violations.length})</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="space-y-2 ml-1 pl-4 border-l-2 border-slate-100">
          {violations.map((v) => (
            <ViolationRow key={v.id} v={v} showAction={showAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function UnitDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;

  const [unit, setUnit] = useState<Unit | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

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
              <Button size="sm" variant="outline" className="rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm transition-all hover:bg-slate-50">
                <Edit2 className="mr-2 h-4 w-4" />
                Edit Details
              </Button>
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

        {/* Violations section */}
        {violations.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-16 text-center">
            <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 mb-4">
                 <AlertTriangle className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">No violations found</h3>
              <p className="mb-4 mt-2 text-sm text-slate-500">
                Violations for this unit will appear here once they are linked to the unit through an uploaded NOI.
              </p>
              <Link href="/parse">
                <Button variant="outline" className="rounded-xl mt-2 bg-white">
                  Upload New NOI
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Health bar (Option 1) */}
            <HealthBar violations={violations} />

            {/* Attention banner */}
            {overdueCount > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <span className="text-sm font-semibold text-red-800">
                  {overdueCount} violation{overdueCount !== 1 ? 's' : ''} past deadline — immediate action required
                </span>
              </div>
            )}

            {/* Action-oriented sections (Option 3) */}
            <ViolationSection
              title="Needs Your Action"
              icon={AlertTriangle}
              violations={needsAction}
              showAction
              defaultOpen
              accentColor="bg-amber-100 text-amber-700"
            />

            <ViolationSection
              title="In Progress"
              icon={Clock}
              violations={inProgress}
              defaultOpen
              accentColor="bg-blue-100 text-blue-700"
            />

            <ViolationSection
              title="Not Started / Resolved"
              icon={CheckCircle2}
              violations={inactive}
              defaultOpen={inactive.length <= 3}
              accentColor="bg-slate-100 text-slate-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
