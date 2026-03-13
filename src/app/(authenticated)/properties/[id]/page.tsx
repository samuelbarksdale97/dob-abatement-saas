'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Plus, DollarSign, AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/status-transitions';
import type { ViolationStatus } from '@/lib/types';

interface UnitSummary {
  id: string;
  unit_number: string;
  is_vacant: boolean;
  occupant_name: string | null;
  occupant_phone: string | null;
  violation_count: number;
  worst_status: ViolationStatus | null;
}

interface PropertyDetail {
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    zip: string | null;
    notes: string | null;
    created_at: string;
  };
  units: UnitSummary[];
  total_violations: number;
  total_fines: number;
  unlinked_violations: number;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const propertyId = params.id as string;

  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [propRes, unitsRes] = await Promise.all([
        fetch(`/api/properties/${propertyId}`),
        fetch(`/api/properties/${propertyId}/units`),
      ]);

      if (!propRes.ok) throw new Error('Failed to fetch property');

      const propData = await propRes.json();
      const unitsData = await unitsRes.json();

      setDetail({
        property: propData.property,
        units: (unitsData.units || []).map((u: any) => ({
          ...u,
          violation_count: u.violation_count ?? 0,
          worst_status: u.worst_status ?? null,
        })),
        total_violations: 0,
        total_fines: 0,
        unlinked_violations: 0,
      });
    } catch (error) {
      console.error('Failed to fetch property detail:', error);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div>
        <Nav title="Property Detail" />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div>
        <Nav title="Property Not Found" />
        <div className="p-6 text-center text-gray-500">Property not found.</div>
      </div>
    );
  }

  return (
    <div>
      <Nav title={detail.property.address || 'Property Detail'} />
      <div className="space-y-6 p-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-gray-700">Portfolio</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900">{detail.property.address}</span>
        </nav>

        {/* Stats bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-slate-200/60 rounded-xl">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
              <Building2 className="h-24 w-24 text-slate-900" />
            </div>
            <CardContent className="flex items-center gap-4 p-6 relative z-10">
              <div className="rounded-xl p-3 bg-blue-50 text-blue-600">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 tracking-tight">Total Violations</p>
                <p className="text-3xl font-bold tracking-tight text-slate-900">{detail.total_violations}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-slate-200/60 rounded-xl">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
               <DollarSign className="h-24 w-24 text-slate-900" />
             </div>
            <CardContent className="flex items-center gap-4 p-6 relative z-10">
              <div className="rounded-xl p-3 bg-emerald-50 text-emerald-600">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 tracking-tight">Total Fines</p>
                <p className="text-3xl font-bold tracking-tight text-slate-900">${detail.total_fines.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-slate-200/60 rounded-xl">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                <AlertTriangle className="h-24 w-24 text-slate-900" />
            </div>
            <CardContent className="flex items-center gap-4 p-6 relative z-10">
              <div className="rounded-xl p-3 bg-orange-50 text-orange-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 tracking-tight">Unlinked</p>
                <p className="text-3xl font-bold tracking-tight text-slate-900">{detail.unlinked_violations}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Units grid */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Units ({detail.units.length})
          </h2>
          <Button size="sm" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add Unit
          </Button>
        </div>

        {detail.units.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
            <p className="text-sm text-gray-500">No units yet. Units are auto-created when NOIs are parsed.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {detail.units.map((unit) => (
              <Link key={unit.id} href={`/properties/${propertyId}/units/${unit.id}`}>
                <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] border-slate-200/60 rounded-2xl group bg-white">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">Unit {unit.unit_number}</h3>
                      <Badge variant={unit.is_vacant ? 'secondary' : 'outline'} className="text-[0.65rem] uppercase tracking-wider font-bold rounded-md">
                        {unit.is_vacant ? 'Vacant' : 'Occupied'}
                      </Badge>
                    </div>
                    {unit.occupant_name && (
                      <p className="mb-4 text-sm font-medium text-slate-500">{unit.occupant_name}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-500 font-medium border-t border-slate-100 pt-3 mt-auto">
                      <span>{unit.violation_count} violation{unit.violation_count !== 1 ? 's' : ''}</span>
                      {unit.worst_status && (
                        <span className={`rounded-full px-2 py-1 bg-slate-100 ${STATUS_COLORS[unit.worst_status]}`}>
                          {STATUS_LABELS[unit.worst_status]}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
