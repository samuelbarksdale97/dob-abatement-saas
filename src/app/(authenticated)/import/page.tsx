'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Nav } from '@/components/layout/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ParsedRow {
  [key: string]: string;
}

// Map common column name variations to our schema fields
function mapColumns(row: ParsedRow): Record<string, unknown> {
  const findValue = (...keys: string[]): string => {
    for (const key of keys) {
      const match = Object.keys(row).find(k =>
        k.toLowerCase().replace(/[_\s-]/g, '') === key.toLowerCase().replace(/[_\s-]/g, ''),
      );
      if (match && row[match]) return row[match];
    }
    return '';
  };

  return {
    notice_id: findValue('notice_id', 'noticeid', 'noi', 'noinumber', 'noi_number'),
    respondent: findValue('respondent', 'owner', 'propertyowner', 'llc'),
    infraction_address: findValue('address', 'infraction_address', 'infractionaddress', 'property', 'propertyaddress'),
    date_of_service: findValue('date_of_service', 'dateofservice', 'servicedate', 'date'),
    total_fines: findValue('total_fines', 'totalfines', 'fines', 'fineamount', 'fine'),
    priority: findValue('priority', 'urgency', 'level'),
    abatement_deadline: findValue('abatement_deadline', 'deadline', 'duedate', 'due_date'),
    notes: findValue('notes', 'comments', 'description'),
    status: findValue('status') || 'NEW',
  };
}

export default function ImportPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const router = useRouter();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data as ParsedRow[];
        setRows(data);
        if (data.length > 0) {
          setColumns(Object.keys(data[0]));
        }
      },
      error: () => {
        toast.error('Failed to parse CSV file');
      },
    });
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const mapped = rows.map(mapColumns);

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violations: mapped }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      setImportCount(data.imported);
      setImported(true);
      toast.success(`Successfully imported ${data.imported} violations`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <Nav title="CSV Import" />
      <div className="mx-auto max-w-4xl p-6">
        <h2 className="mb-2 text-2xl font-semibold">Import Violations from CSV</h2>
        <p className="mb-6 text-sm text-gray-500">
          Upload a CSV or Excel export of existing violations. Column names will be automatically mapped.
        </p>

        {imported ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <h3 className="text-xl font-semibold">Import Complete</h3>
              <p className="text-gray-500">{importCount} violations imported successfully.</p>
              <Button onClick={() => router.push('/dashboard')}>
                View Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <Upload className="h-12 w-12 text-gray-400" />
              <p className="text-gray-500">Choose a CSV file to import</p>
              <label className="cursor-pointer">
                <span className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Select CSV File
                </span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              <div className="mt-4 rounded-lg bg-gray-50 p-4 text-xs text-gray-500">
                <p className="mb-2 font-medium">Expected columns (flexible naming):</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>notice_id / NOI Number</li>
                  <li>address / infraction_address</li>
                  <li>respondent / owner</li>
                  <li>total_fines / fine amount</li>
                  <li>date_of_service / date</li>
                  <li>priority (1-3)</li>
                  <li>deadline / due_date</li>
                  <li>notes / comments</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Preview ({rows.length} rows)</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setRows([]); setColumns([]); }}>
                      Choose Different File
                    </Button>
                    <Button onClick={handleImport} disabled={importing}>
                      {importing ? 'Importing...' : `Import ${rows.length} Violations`}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        {columns.slice(0, 6).map((col) => (
                          <TableHead key={col} className="text-xs">{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 20).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs text-gray-400">{i + 1}</TableCell>
                          {columns.slice(0, 6).map((col) => (
                            <TableCell key={col} className="max-w-[150px] truncate text-xs">
                              {row[col] || '—'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length > 20 && (
                  <p className="mt-2 text-xs text-gray-400">
                    Showing first 20 of {rows.length} rows
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
