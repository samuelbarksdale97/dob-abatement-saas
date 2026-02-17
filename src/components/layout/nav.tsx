'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavProps {
  title?: string;
}

export function Nav({ title }: NavProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h1 className="text-xl font-semibold text-gray-900">
        {title || 'Dashboard'}
      </h1>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-gray-500" />
        </Button>
      </div>
    </header>
  );
}
