'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, User, Phone, Edit2 } from 'lucide-react';
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
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard" className="hover:text-gray-700">Portfolio</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/properties/${propertyId}`} className="hover:text-gray-700">Property</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900">Unit {unit.unit_number}</span>
        </nav>

        {/* Unit info card */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Unit {unit.unit_number}</h2>
                <Badge variant={unit.is_vacant ? 'secondary' : 'outline'}>
                  {unit.is_vacant ? 'Vacant' : 'Occupied'}
                </Badge>
              </div>
              <Button size="sm" variant="outline">
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>

            {unit.occupant_name && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>{unit.occupant_name}</span>
              </div>
            )}
            {unit.occupant_phone && (
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-4 w-4" />
                <span>{unit.occupant_phone}</span>
              </div>
            )}
            {unit.notes && (
              <p className="mt-3 text-sm text-gray-500">{unit.notes}</p>
            )}
          </CardContent>
        </Card>

        {/* Violations for this unit */}
        <div>
          <h3 className="mb-3 text-lg font-semibold">Violations</h3>
          <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
            <p className="text-sm text-gray-500">
              Violations for this unit will appear here once violations are linked to units.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
