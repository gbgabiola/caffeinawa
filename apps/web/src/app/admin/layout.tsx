'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import AdminNav from '@/components/admin/AdminNav';
import { useAuth } from '@/components/auth/AuthProvider';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const { customer, isLoading } = useAuth();

  const isAdmin = customer?.role === 'ADMIN';

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!customer) {
      router.replace('/login');
      return;
    }

    if (!isAdmin) {
      router.replace('/');
    }
  }, [customer, isAdmin, isLoading, router]);

  if (isLoading || !customer || !isAdmin) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-gray-600">Checking admin access...</p>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50 lg:flex-row">
      <AdminNav />

      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
