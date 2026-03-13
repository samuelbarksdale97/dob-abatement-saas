'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, AlertTriangle, Clock, DollarSign } from 'lucide-react';
import type { PropertyPortfolioStats } from '@/lib/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/status-transitions';
import type { ViolationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PropertyCardProps {
  property: PropertyPortfolioStats;
}

export function PropertyCard({ property }: PropertyCardProps) {
  const hasOverdue = property.overdue_count > 0;
  const hasP1 = property.p1_count > 0;

  // Format deadline
  const deadlineText = property.next_deadline
    ? new Date(property.next_deadline).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  // Get top 3 status counts for color dots
  const statusEntries = Object.entries(property.status_counts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  return (
    <Link href={`/properties/${property.property_id}`}>
      <Card className={cn(
        "group relative overflow-hidden transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1 border-slate-200/60 rounded-2xl bg-white",
        hasOverdue ? 'ring-1 ring-red-100 border-red-100' : hasP1 ? 'ring-1 ring-orange-100 border-orange-100' : ''
      )}>
        <CardContent className="p-5">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[1.05rem] font-bold tracking-tight text-slate-900 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">
                {property.address}
              </h3>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {property.unit_count > 0 ? `${property.unit_count} Units` : 'Building'}
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                <span>{property.violation_count} Violations</span>
              </div>
            </div>
            {(hasOverdue || hasP1) && (
              <Badge variant="destructive" className="shrink-0 text-[0.65rem] uppercase tracking-wider font-bold rounded-md bg-red-100 text-red-700 hover:bg-red-200 border-0 shadow-none">
                {hasOverdue ? 'Overdue' : 'P1 Urgent'}
              </Badge>
            )}
          </div>

          {/* Status Breakdown (Progress Bar Style) */}
          {statusEntries.length > 0 && (
            <div className="mb-5 space-y-2">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  {statusEntries.map(([status, count]) => (
                    <div 
                      key={status} 
                      className={cn("h-full", STATUS_COLORS[status as ViolationStatus]?.replace('text-', 'bg-').replace('bg-', 'bg-').split(' ')[0] || 'bg-slate-300')}
                      style={{ width: `${(count / property.violation_count) * 100}%` }}
                    />
                  ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {statusEntries.map(([status, count]) => (
                  <div key={status} className="flex items-center gap-1.5 text-[0.7rem] font-medium text-slate-600">
                    <span className={cn("h-2 w-2 rounded-full", STATUS_COLORS[status as ViolationStatus]?.replace('text-', 'bg-').replace('bg-', 'bg-').split(' ')[0] || 'bg-slate-300')} />
                    <span>{count} {STATUS_LABELS[status as ViolationStatus] || status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer metrics */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-auto">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
              <DollarSign className="h-3.5 w-3.5" />
              <span>{property.total_fines.toLocaleString()}</span>
            </div>
            {deadlineText && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                <span>Next: {deadlineText}</span>
              </div>
            )}
            {hasOverdue && !deadlineText && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-md">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{property.overdue_count} overdue</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
