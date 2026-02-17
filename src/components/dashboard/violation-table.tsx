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
        className="flex items-center gap-1 hover:text-gray-900"
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? 'text-blue-600' : 'text-gray-400'}`} />
      </button>
    </TableHead>
  );

  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader field="priority">Priority</SortableHeader>
            <SortableHeader field="notice_id">NOI #</SortableHeader>
            <TableHead>Address</TableHead>
            <SortableHeader field="total_fines">Fines</SortableHeader>
            <SortableHeader field="abatement_deadline">Deadline</SortableHeader>
            <TableHead>Status</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>AI Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {violations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-12 text-center text-gray-500">
                No violations found. Upload an NOI PDF or import from CSV to get started.
              </TableCell>
            </TableRow>
          ) : (
            violations.map((v) => {
              const daysLeft = getDaysRemaining(v.abatement_deadline);
              const urgencyColor = getUrgencyColor(v.abatement_deadline, v.status);
              return (
                <TableRow key={v.id} className="cursor-pointer hover:bg-gray-50">
                  <TableCell>
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${getPriorityColor(v.priority)}`}>
                      {getPriorityLabel(v.priority).split(' - ')[0]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/${v.id}`} className="font-medium text-blue-600 hover:underline">
                      {v.notice_id || 'Pending'}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-gray-600">
                    {v.infraction_address || '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {v.total_fines ? `$${v.total_fines.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm ${urgencyColor}`}>
                      {daysLeft !== null
                        ? daysLeft < 0
                          ? `${Math.abs(daysLeft)}d overdue`
                          : `${daysLeft}d left`
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_COLORS[v.status]}>
                      {STATUS_LABELS[v.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {(v.violation_items as unknown as { count: number }[])?.[0]?.count ?? 0}
                  </TableCell>
                  <TableCell className="text-sm">
                    {(() => {
                      const costs = (v.parse_metadata as Record<string, unknown>)?.costs as ParseCosts | undefined;
                      const total = costs?.total_usd ?? (
                        (costs?.ai_parse?.cost_usd ?? 0) + (costs?.analyze_pages?.cost_usd ?? 0)
                      );
                      return total > 0 ? (
                        <span className="flex items-center gap-0.5 text-amber-600">
                          <Coins className="h-3 w-3" />${total.toFixed(4)}
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
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
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
