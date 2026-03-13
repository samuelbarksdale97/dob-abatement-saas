'use client';

import { NotificationBell } from '@/components/layout/notification-bell';

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
        <NotificationBell />
      </div>
    </header>
  );
}
