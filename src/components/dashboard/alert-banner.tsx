'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import type { ViolationStats } from '@/lib/types';

interface AlertBannerProps {
  stats: ViolationStats | null;
}

export function AlertBanner({ stats }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !stats) return null;

  const alerts: string[] = [];
  if (stats.overdue > 0) {
    alerts.push(`${stats.overdue} violation${stats.overdue > 1 ? 's' : ''} overdue`);
  }
  if (stats.by_priority?.P1 > 0) {
    alerts.push(`${stats.by_priority.P1} P1 critical violation${stats.by_priority.P1 > 1 ? 's' : ''}`);
  }
  if (stats.due_within_10_days > 0) {
    alerts.push(`${stats.due_within_10_days} due within 10 days`);
  }

  if (alerts.length === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <p className="text-sm font-medium text-red-800">
          Needs attention: {alerts.join(' | ')}
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-red-400 hover:text-red-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
