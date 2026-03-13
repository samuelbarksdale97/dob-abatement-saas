'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Table,
  FileUp,
  Upload,
  ClipboardList,
  LogOut,
  Settings,
  Users,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Portfolio Home', icon: LayoutDashboard },
  { href: '/violations', label: 'All Violations', icon: Table },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/parse', label: 'Parse NOI', icon: FileUp },
  { href: '/import', label: 'CSV Import', icon: Upload },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside className="flex h-[calc(100vh-1rem)] w-[240px] flex-col bg-transparent pl-2 pb-2">
      <div className="flex h-20 items-center justify-start gap-3 px-6 mb-4 mt-2">
        <div className="flex items-center justify-center p-2 rounded-xl bg-slate-900 text-white shadow-md">
          <ClipboardList className="h-6 w-6" />
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">Nexark</span>
      </div>

      <nav className="flex-1 space-y-1.5 px-4">
        <div className="text-xs font-semibold text-slate-400 mb-4 px-2 tracking-wider mt-2">MENU</div>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
