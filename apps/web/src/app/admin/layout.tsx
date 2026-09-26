import type { ReactNode } from 'react';

import AdminNav from '@/components/admin/AdminNav';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex min-h-[calc(100vh-65px)] flex-1 flex-col bg-gray-50 lg:flex-row">
      <AdminNav />

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
