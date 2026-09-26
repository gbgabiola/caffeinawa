'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';

export default function AdminPage() {
  const router = useRouter();
  const { customer, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!customer) {
      router.replace('/login');
      return;
    }

    if (customer.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [customer, isLoading, router]);

  if (isLoading || !customer || customer.role !== 'ADMIN') {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-gray-600">Checking admin access...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Admin Dashboard</h1>

          <p className="mt-3 max-w-2xl text-gray-600">
            Manage customers, orders, and coffee catalog data from the administration area.
          </p>

          <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6">
            <p className="text-sm text-gray-600">
              Dashboard modules will be added incrementally in the next checkpoints.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
