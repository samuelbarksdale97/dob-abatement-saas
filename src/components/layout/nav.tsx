'use client';

import { NotificationBell } from '@/components/layout/notification-bell';

interface NavProps {
  title?: string;
}

export function Nav({ title }: NavProps) {
  return (
    <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-100/80 bg-white/95 backdrop-blur-md px-8 sticky top-0 z-20">
      <h1 className="text-[1.35rem] font-bold tracking-tight text-slate-800">
        {title || 'Dashboard'}
      </h1>
      <div className="flex items-center gap-4">
        <NotificationBell />
      </div>
    </header>
  );
}
