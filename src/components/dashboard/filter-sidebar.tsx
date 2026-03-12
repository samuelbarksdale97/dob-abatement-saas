'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, AlertTriangle } from 'lucide-react';
import type { ViolationStatus, Property } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/status-transitions';

interface FilterSidebarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  priorityFilter: string;
  onPriorityChange: (value: string) => void;
  onClearFilters: () => void;
  // Enhanced filters
  propertyFilter?: string;
  onPropertyChange?: (value: string) => void;
  dateFrom?: string;
  onDateFromChange?: (value: string) => void;
  dateTo?: string;
  onDateToChange?: (value: string) => void;
  needsAttention?: boolean;
  onNeedsAttentionChange?: (value: boolean) => void;
}

const STATUSES = Object.entries(STATUS_LABELS) as [ViolationStatus, string][];

export function FilterSidebar({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  onClearFilters,
  propertyFilter = '',
  onPropertyChange,
  dateFrom = '',
  onDateFromChange,
  dateTo = '',
  onDateToChange,
  needsAttention = false,
  onNeedsAttentionChange,
}: FilterSidebarProps) {
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    if (onPropertyChange) {
      fetch('/api/properties')
        .then(r => r.json())
        .then(d => setProperties(d.properties || []))
        .catch(() => {});
    }
  }, [onPropertyChange]);

  const hasFilters = search || statusFilter || priorityFilter || propertyFilter || dateFrom || dateTo || needsAttention;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search NOI #, address, respondent..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Label className="mb-1 text-xs text-gray-500">Status</Label>
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-40">
          <Label className="mb-1 text-xs text-gray-500">Priority</Label>
          <Select value={priorityFilter} onValueChange={onPriorityChange}>
            <SelectTrigger>
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="1">P1 - Critical</SelectItem>
              <SelectItem value="2">P2 - High</SelectItem>
              <SelectItem value="3">P3 - Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {onPropertyChange && (
          <div className="w-52">
            <Label className="mb-1 text-xs text-gray-500">Property</Label>
            <Select value={propertyFilter || 'all'} onValueChange={onPropertyChange}>
              <SelectTrigger>
                <SelectValue placeholder="All properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.address.length > 30 ? p.address.slice(0, 30) + '...' : p.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {onDateFromChange && (
          <div>
            <Label className="mb-1 text-xs text-gray-500">Deadline From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => onDateFromChange(e.target.value)}
              className="w-36"
            />
          </div>
        )}

        {onDateToChange && (
          <div>
            <Label className="mb-1 text-xs text-gray-500">Deadline To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={e => onDateToChange(e.target.value)}
              className="w-36"
            />
          </div>
        )}

        {onNeedsAttentionChange && (
          <div className="flex items-end">
            <Button
              variant={needsAttention ? 'default' : 'outline'}
              size="sm"
              onClick={() => onNeedsAttentionChange(!needsAttention)}
              className="gap-1"
            >
              <AlertTriangle className="h-3 w-3" />
              Needs Attention
              {needsAttention && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">ON</Badge>
              )}
            </Button>
          </div>
        )}

        {hasFilters && (
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
