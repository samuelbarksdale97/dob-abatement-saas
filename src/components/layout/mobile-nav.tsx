'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { SidebarBrand, SidebarContent } from './sidebar';

/**
 * Mobile-only top bar (hidden at `md` and up). The hamburger opens a left
 * slide-out drawer containing the same navigation as the desktop sidebar.
 * Rendered inside the authenticated layout so it appears on every page.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden flex h-14 shrink-0 items-center gap-3 border-b border-slate-100 bg-white/95 px-4 backdrop-blur-md">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open navigation menu"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="w-[280px] max-w-[85vw] bg-slate-50 p-0"
        >
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <div className="flex h-full flex-col pb-2">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <SidebarBrand className="truncate whitespace-nowrap text-base" />
    </div>
  );
}
