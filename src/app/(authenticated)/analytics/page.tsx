'use client';

import { useEffect, useState, useCallback } from 'react';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import { STATUS_LABELS } from '@/lib/status-transitions';
import type { Property } from '@/lib/types';

interface AnalyticsData {
  avg_resolution_days: number;
  approval_rate: number;
  total_fines: number;
  opened_vs_closed: Array<{ week: string; opened: number; closed: number }>;
  status_distribution: Record<string, number>;
  fines_by_property: Array<{ address: string; fines: number }>;
  contractor_performance: Array<{ contractor_name: string; total_assignments: number; completed: number; on_time: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: '#6b7280',
  PARSING: '#8b5cf6',
  PARSED: '#3b82f6',
  ASSIGNED: '#0ea5e9',
  IN_PROGRESS: '#f59e0b',
  AWAITING_PHOTOS: '#f97316',
  PHOTOS_UPLOADED: '#84cc16',
  READY_FOR_SUBMISSION: '#10b981',
  SUBMITTED: '#06b6d4',
  APPROVED: '#22c55e',
  REJECTED: '#ef4444',
  ADDITIONAL_INFO_REQUESTED: '#eab308',
  CLOSED: '#6b7280',
};

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0ea5e9', '#f97316', '#84cc16', '#06b6d4', '#22c55e', '#eab308', '#6b7280'];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (propertyId && propertyId !== 'all') params.set('property_id', propertyId);
    params.set('date_from', dateFrom);
    params.set('date_to', dateTo);

    try {
      const res = await fetch(`/api/analytics?${params}`);
      const result = await res.json();
      setData(result);
    } catch {
      // silent fail
    }
    setLoading(false);
  }, [propertyId, dateFrom, dateTo]);

  useEffect(() => {
    fetch('/api/properties')
      .then(r => r.json())
      .then(d => setProperties(d.properties || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const statusPieData = data
    ? Object.entries(data.status_distribution).map(([status, count]) => ({
        name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
        value: count,
        fill: STATUS_COLORS[status] || '#6b7280',
      }))
    : [];

  const contractorBarData = data?.contractor_performance?.map(c => ({
    name: c.contractor_name?.split(' ')[0] || 'Unknown',
    'On-Time %': c.total_assignments > 0 ? Math.round((c.on_time / c.total_assignments) * 100) : 0,
    'Completion %': c.total_assignments > 0 ? Math.round((c.completed / c.total_assignments) * 100) : 0,
  })) || [];

  return (
    <div>
      <Nav title="Analytics" />
      <div className="space-y-6 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-52">
            <Label className="mb-1 text-xs text-gray-500">Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 text-xs text-gray-500">From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="mb-1 text-xs text-gray-500">To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : data ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Avg Resolution</p>
                  <p className="text-2xl font-bold">{data.avg_resolution_days}d</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Approval Rate</p>
                  <p className="text-2xl font-bold">{data.approval_rate}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Total Fines</p>
                  <p className="text-2xl font-bold text-red-600">
                    ${Number(data.total_fines).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Open / Closed</p>
                  <p className="text-2xl font-bold">
                    {data.opened_vs_closed.reduce((s, w) => s + w.opened, 0)} / {data.opened_vs_closed.reduce((s, w) => s + w.closed, 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Violations Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={data.opened_vs_closed}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} tickFormatter={w => {
                        const d = new Date(w);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="opened" stroke="#ef4444" strokeWidth={2} name="Opened" />
                      <Line type="monotone" dataKey="closed" stroke="#22c55e" strokeWidth={2} name="Closed" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {statusPieData.map((entry, i) => (
                          <Cell key={entry.name} fill={entry.fill || PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Fines by Property</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.fines_by_property.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={data.fines_by_property} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="address" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                        <Bar dataKey="fines" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-12 text-center text-sm text-gray-400">No property data</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contractor Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {contractorBarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={contractorBarData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="On-Time %" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Completion %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-12 text-center text-sm text-gray-400">No contractor data</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <p className="py-12 text-center text-gray-400">Failed to load analytics data</p>
        )}
      </div>
    </div>
  );
}
