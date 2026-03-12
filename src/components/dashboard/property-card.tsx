'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, AlertTriangle, Clock, DollarSign } from 'lucide-react';
import type { PropertyPortfolioStats } from '@/lib/types';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/status-transitions';
import type { ViolationStatus } from '@/lib/types';

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
      <Card className={`transition-all hover:shadow-md ${hasOverdue ? 'border-red-200' : hasP1 ? 'border-orange-200' : ''}`}>
        <CardContent className="p-5">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">
                {property.address}
              </h3>
            </div>
            {(hasOverdue || hasP1) && (
              <Badge variant="destructive" className="ml-2 shrink-0 text-xs">
                {hasOverdue ? 'Overdue' : 'P1'}
              </Badge>
            )}
          </div>

          {/* Stats row */}
          <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
            <span className="font-medium text-gray-900">
              {property.violation_count} violation{property.violation_count !== 1 ? 's' : ''}
            </span>
            {property.unit_count > 0 && (
              <span>{property.unit_count} unit{property.unit_count !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Status dots */}
          {statusEntries.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {statusEntries.map(([status, count]) => (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[status as ViolationStatus] || 'bg-gray-100 text-gray-700'}`}
                >
                  {count} {STATUS_LABELS[status as ViolationStatus] || status}
                </span>
              ))}
            </div>
          )}

          {/* Footer metrics */}
          <div className="flex items-center justify-between border-t pt-3 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              <span>${property.total_fines.toLocaleString()}</span>
            </div>
            {deadlineText && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Next: {deadlineText}</span>
              </div>
            )}
            {hasOverdue && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="h-3 w-3" />
                <span>{property.overdue_count} overdue</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
