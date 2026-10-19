'use client';

import { useQuery } from '@tanstack/react-query';

import { CoffeeGrid } from '@/components/coffee/CoffeeGrid';
import QueryProvider from '@/components/providers/QueryProvider';
import { getMenu } from '@/lib/api/menu';

function MenuContent() {
  const menuQuery = useQuery({
    queryKey: ['menu'],
    queryFn: getMenu,
    staleTime: 30_000,
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wider">Caffeinawa</p>

        <h1 className="mt-2 text-4xl font-bold">Our Coffee</h1>

        <p className="mt-3 max-w-2xl text-gray-600">
          Discover handcrafted coffee made for every kind of coffee moment.
        </p>
      </header>

      {menuQuery.isPending ? (
        <p role="status" className="text-sm text-gray-600">
          Loading menu...
        </p>
      ) : menuQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p role="alert" className="text-sm font-medium text-red-700">
            {menuQuery.error.message}
          </p>

          <button
            type="button"
            disabled={menuQuery.isFetching}
            onClick={() => void menuQuery.refetch()}
            className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            {menuQuery.isFetching ? 'Retrying...' : 'Try again'}
          </button>
        </div>
      ) : menuQuery.data.length === 0 ? (
        <p className="text-sm text-gray-600">No coffee is available on the menu yet.</p>
      ) : (
        <CoffeeGrid coffees={menuQuery.data} />
      )}
    </main>
  );
}

export default function MenuPage() {
  return (
    <QueryProvider>
      <MenuContent />
    </QueryProvider>
  );
}
