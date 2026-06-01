import { MobileNav } from './mobile-nav';

interface NavProps {
  title?: string;
}

export function Nav({ title }: NavProps) {
  return (
    <header className="flex h-16 md:h-20 shrink-0 items-center gap-2 border-b border-slate-100/80 bg-white/95 backdrop-blur-md px-4 md:px-8 sticky top-0 z-20">
      <MobileNav />
      <h1 className="truncate text-[1.35rem] font-bold tracking-tight text-slate-800">
        {title || 'Dashboard'}
      </h1>
    </header>
  );
}
