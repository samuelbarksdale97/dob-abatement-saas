'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, User, Phone, Edit2, Building2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import type { Unit } from '@/lib/types';

export default function UnitDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;
  const unitId = params.unitId as string;

  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUnit = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch unit data from the units list and find ours
      const res = await fetch(`/api/properties/${propertyId}/units`);
      const data = await res.json();
      const found = (data.units || []).find((u: Unit) => u.id === unitId);
      setUnit(found || null);
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

  return (
    <div>
      <Nav title={`Unit ${unit.unit_number}`} />
      <div className="space-y-6 p-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-8">
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
                <p className="text-sm font-medium text-slate-600 leading-relaxed italic">"{unit.notes}"</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Violations for this unit */}
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
             <h3 className="text-lg font-bold tracking-tight text-slate-900">Active Violations</h3>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-16 text-center transition-colors hover:bg-slate-50">
            <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 mb-4">
                 <AlertTriangle className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">No violations found</h3>
              <p className="mb-4 mt-2 text-sm text-slate-500">
                Violations for this unit will appear here once they are linked to the unit through an uploaded NOI.
              </p>
              <Button variant="outline" className="rounded-xl mt-2 bg-white">
                Upload New NOI
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
