'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Clock, CheckCircle, DollarSign } from 'lucide-react';
import type { ViolationStats } from '@/lib/types';

interface StatsPanelProps {
  stats: ViolationStats | null;
}

export function StatsPanel({ stats }: StatsPanelProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-16 animate-pulse rounded bg-gray-100" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Open',
      value: stats.total,
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Overdue',
      value: stats.overdue,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'Due in 10 Days',
      value: stats.due_within_10_days,
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: 'Total Fines',
      value: `$${stats.total_fines.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-slate-200/60 rounded-xl">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
             <card.icon className="h-24 w-24 text-slate-900" />
          </div>
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className={`rounded-xl p-3 ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 tracking-tight">{card.label}</p>
              <h4 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">{card.value}</h4>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
