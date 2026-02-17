'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { StatsPanel } from '@/components/dashboard/stats-panel';
import { AlertBanner } from '@/components/dashboard/alert-banner';
import { ViolationTable } from '@/components/dashboard/violation-table';
import { FilterSidebar } from '@/components/dashboard/filter-sidebar';
import { Button } from '@/components/ui/button';
import { FileUp, Upload } from 'lucide-react';
import Link from 'next/link';
import type { Violation, ViolationStats, SortField, SortDirection } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

function DashboardContent() {
  const searchParams = useSearchParams();

  const [violations, setViolations] = useState<Violation[]>([]);
  const [stats, setStats] = useState<ViolationStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter state from URL
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || '');
  const [sortBy, setSortBy] = useState<SortField>((searchParams.get('sortBy') as SortField) || 'created_at');
  const [sortDir, setSortDir] = useState<SortDirection>((searchParams.get('sortDir') as SortDirection) || 'desc');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));

  const fetchViolations = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
    if (priorityFilter && priorityFilter !== 'all') params.set('priority', priorityFilter);
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    params.set('page', page.toString());

    const res = await fetch(`/api/violations?${params}`);
    const data = await res.json();

    setViolations(data.violations || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search, statusFilter, priorityFilter, sortBy, sortDir, page]);

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/stats');
    const data = await res.json();
    setStats(data);
  }, []);

  useEffect(() => {
    fetchViolations();
    fetchStats();
  }, [fetchViolations, fetchStats]);

  // Set up realtime subscription for live updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('violations-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'violations' },
        () => {
          fetchViolations();
          fetchStats();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchViolations, fetchStats]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchViolations();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPriorityFilter('');
    setPage(1);
  };

  return (
    <div className="space-y-6 p-6">
      <AlertBanner stats={stats} />
      <StatsPanel stats={stats} />

      <div className="flex items-center justify-between">
        <FilterSidebar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusChange={(v) => { setStatusFilter(v); setPage(1); }}
          priorityFilter={priorityFilter}
          onPriorityChange={(v) => { setPriorityFilter(v); setPage(1); }}
          onClearFilters={handleClearFilters}
        />
        <div className="flex gap-2">
          <Link href="/import">
            <Button variant="outline" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </Link>
          <Link href="/parse">
            <Button size="sm">
              <FileUp className="mr-2 h-4 w-4" />
              Parse NOI
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <ViolationTable
          violations={violations}
          total={total}
          page={page}
          pageSize={25}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <Nav title="Dashboard" />
      <Suspense fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
