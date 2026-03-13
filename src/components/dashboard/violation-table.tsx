'use client';

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ArrowUpDown, Coins } from 'lucide-react';
import type { Violation, SortField, SortDirection } from '@/lib/types';
import type { ParseCosts } from '@/lib/ai/schemas';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  getPriorityColor,
  getPriorityLabel,
  getUrgencyColor,
  getDaysRemaining,
} from '@/lib/status-transitions';
import { cn } from '@/lib/utils';

interface ViolationTableProps {
  violations: Violation[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: SortField;
  sortDir: SortDirection;
  onSort: (field: SortField) => void;
  onPageChange: (page: number) => void;
}

export function ViolationTable({
  violations,
  total,
  page,
  pageSize,
  sortBy,
  sortDir,
  onSort,
  onPageChange,
}: ViolationTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 hover:text-gray-900 font-semibold text-slate-700"
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-blue-600' : 'text-gray-400'}`} />
      </button>
    </TableHead>
  );

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50/50">
          <TableRow className="border-b border-slate-100 hover:bg-transparent">
            <SortableHeader field="priority">Priority</SortableHeader>
            <SortableHeader field="notice_id">NOI #</SortableHeader>
            <TableHead className="font-semibold text-slate-700 max-w-[200px]">Address</TableHead>
            <SortableHeader field="total_fines">Fines</SortableHeader>
            <SortableHeader field="abatement_deadline">Deadline</SortableHeader>
            <TableHead className="font-semibold text-slate-700">Status</TableHead>
            <TableHead className="font-semibold text-slate-700">Items</TableHead>
            <TableHead className="font-semibold text-slate-700">AI Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {violations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-20 text-center text-slate-500 font-medium">
                No violations found. Upload an NOI PDF or import from CSV to get started.
              </TableCell>
            </TableRow>
          ) : (
            violations.map((v) => {
              const daysLeft = getDaysRemaining(v.abatement_deadline);
              const urgencyColor = getUrgencyColor(v.abatement_deadline, v.status);
              return (
                <TableRow key={v.id} className="cursor-pointer hover:bg-slate-50 transition-colors py-4">
                  <TableCell className="py-4">
                    <span className={cn(`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wider`, getPriorityColor(v.priority))}>
                      {getPriorityLabel(v.priority).split(' - ')[0]}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <Link href={`/dashboard/${v.id}`} className="font-bold text-slate-900 group transition-colors">
                      <span className="group-hover:text-blue-600 underline-offset-4 group-hover:underline">
                        {v.notice_id || 'Pending'}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="py-4 max-w-[200px] truncate text-sm font-medium text-slate-600">
                    {v.infraction_address || '—'}
                  </TableCell>
                  <TableCell className="py-4 text-sm font-semibold text-slate-700">
                    {v.total_fines ? `$${v.total_fines.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="py-4">
                    <span className={cn("text-sm", urgencyColor)}>
                      {daysLeft !== null
                        ? daysLeft < 0
                          ? `${Math.abs(daysLeft)}d overdue`
                          : `${daysLeft}d left`
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className={cn("inline-flex items-center px-2 py-1 rounded-md text-xs", STATUS_COLORS[v.status])}>
                      {STATUS_LABELS[v.status]}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 text-sm font-semibold text-slate-500">
                    {(v.violation_items as unknown as { count: number }[])?.[0]?.count ?? 0}
                  </TableCell>
                  <TableCell className="py-4 text-sm font-medium">
                    {(() => {
                      const costs = (v.parse_metadata as Record<string, unknown>)?.costs as ParseCosts | undefined;
                      const total = costs?.total_usd ?? (
                        (costs?.ai_parse?.cost_usd ?? 0) + (costs?.analyze_pages?.cost_usd ?? 0)
                      );
                      return total > 0 ? (
                        <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-md w-fit">
                          <Coins className="h-3.5 w-3.5" />${total.toFixed(4)}
                        </span>
                      ) : '—';
                    })()}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <p className="text-sm font-medium text-slate-500">
            Showing <span className="text-slate-900">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> of <span className="text-slate-900">{total}</span>
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
