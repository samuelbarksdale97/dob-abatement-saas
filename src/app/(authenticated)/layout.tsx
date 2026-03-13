import { Sidebar } from '@/components/layout/sidebar';
import { AuthListener } from '@/components/auth/auth-listener';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-slate-50 antialiased p-2 gap-2">
      <AuthListener />
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="flex h-full flex-col rounded-[1.25rem] bg-white shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
