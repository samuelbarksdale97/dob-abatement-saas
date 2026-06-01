'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Table,
  FileUp,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

export const navItems = [
  { href: '/dashboard', label: 'Portfolio Home', icon: LayoutDashboard },
  { href: '/violations', label: 'All Infractions', icon: Table },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/parse', label: 'Parse NOI', icon: FileUp },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function SidebarBrand({ className }: { className?: string }) {
  return (
    <span className={cn('text-xl font-black tracking-tight leading-tight', className)}>
      <span className="text-red-600">Yoke</span>{' '}
      <span className="text-slate-900">Management</span>{' '}
      <span className="text-red-600">Partners</span>
    </span>
  );
}

/**
 * Inner navigation shared by the desktop sidebar and the mobile drawer.
 * `onNavigate` lets the mobile drawer close itself when a link is tapped.
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    onNavigate?.();
    router.push('/login');
  };

  return (
    <>
      <div className="flex h-20 items-center justify-start px-5 mb-4 mt-2">
        <SidebarBrand />
      </div>

      <nav className="flex-1 space-y-1.5 px-4">
        <div className="text-xs font-semibold text-slate-400 mb-4 px-2 tracking-wider mt-2">MENU</div>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900',
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", isActive ? "text-slate-900" : "text-slate-500 group-hover:text-slate-700")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 mt-auto mb-2">
        <div className="text-xs font-semibold text-slate-400 mb-3 px-2 tracking-wider">SYSTEM</div>
        <button
          onClick={handleSignOut}
          className="group flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px] text-slate-500 group-hover:text-red-500" />
          Sign Out
        </button>
      </div>
    </>
  );
}

/**
 * Desktop sidebar. Hidden below the `md` breakpoint, where MobileNav renders a
 * hamburger-triggered drawer with the same navigation instead.
 */
export function Sidebar() {
  return (
    <aside className="hidden md:flex h-[calc(100vh-1rem)] w-[240px] flex-col bg-transparent pl-2 pb-2">
      <SidebarContent />
    </aside>
  );
}
