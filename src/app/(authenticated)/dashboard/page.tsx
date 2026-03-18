'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { Nav } from '@/components/layout/nav';
import { StatsPanel } from '@/components/dashboard/stats-panel';
import { PropertyCard } from '@/components/dashboard/property-card';
import { Button } from '@/components/ui/button';
import { FileUp, Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import type { PropertyPortfolioStats, ViolationStats } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

function PortfolioContent() {
  const [properties, setProperties] = useState<PropertyPortfolioStats[]>([]);
  const [stats, setStats] = useState<ViolationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPortfolio = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    console.log('[DASHBOARD] fetchPortfolio called, showLoading=', showLoading);
    try {
      const res = await fetch('/api/portfolio');
      console.log('[DASHBOARD] /api/portfolio response status:', res.status);
      const data = await res.json();
      console.log('[DASHBOARD] properties:', data.properties?.length, 'stats:', JSON.stringify(data.stats)?.slice(0, 150));
      if (data.error) console.error('[DASHBOARD] API returned error:', data.error);
      setProperties(data.properties || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error('[DASHBOARD] Failed to fetch portfolio:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPortfolio(true);
  }, [fetchPortfolio]);

  // Realtime subscription for live updates (debounced, no loading flash)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('portfolio-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'violations' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => fetchPortfolio(false), 2000);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchPortfolio]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border bg-gray-50" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <StatsPanel stats={stats} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Properties ({properties.length})
        </h2>
        <div className="flex gap-2">
          <Link href="/parse">
            <Button size="sm">
              <FileUp className="mr-2 h-4 w-4" />
              Upload NOI
            </Button>
          </Link>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16">
          <Building2 className="mb-4 h-12 w-12 text-gray-300" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">No properties yet</h3>
          <p className="mb-6 text-sm text-gray-500">
            Upload a Notice of Infraction to get started. Properties are auto-created from parsed addresses.
          </p>
          <Link href="/parse">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Property
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <PropertyCard key={property.property_id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <Nav title="Portfolio Home" />
      <Suspense fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }>
        <PortfolioContent />
      </Suspense>
    </div>
  );
}
