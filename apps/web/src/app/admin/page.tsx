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
    <div className="px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-sm font-medium text-gray-500">Caffeinawa Admin</p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Dashboard</h1>

          <p className="mt-3 max-w-2xl text-gray-600">
            Manage customers, orders, and the coffee catalog from one place.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Customers</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">—</p>
            <p className="mt-1 text-sm text-gray-500">Customer management</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Orders</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">—</p>
            <p className="mt-1 text-sm text-gray-500">Order management</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Coffee</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">—</p>
            <p className="mt-1 text-sm text-gray-500">Catalog management</p>
          </div>
        </div>
      </div>
    </div>
  );
}
