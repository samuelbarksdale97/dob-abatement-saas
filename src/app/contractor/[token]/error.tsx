'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ContractorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Contractor portal error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md">
        <CardContent className="p-6 text-center">
          <h2 className="mb-2 text-xl font-semibold text-red-600">Something went wrong</h2>
          <p className="mb-4 text-gray-600">
            An error occurred while loading the work order. Please try again.
          </p>
          <Button onClick={reset}>Try Again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
