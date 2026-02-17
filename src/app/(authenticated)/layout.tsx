import { Sidebar } from '@/components/layout/sidebar';
import { AuthListener } from '@/components/auth/auth-listener';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <AuthListener />
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
