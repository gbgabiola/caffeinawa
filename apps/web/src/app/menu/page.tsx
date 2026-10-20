'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import type { CoffeeCategory } from '@caffeinawa/types';

import { CoffeeGrid } from '@/components/coffee/CoffeeGrid';
import QueryProvider from '@/components/providers/QueryProvider';
import { getMenu } from '@/lib/api/menu';

const categories: {
  value: CoffeeCategory | 'all';
  label: string;
}[] = [
  { value: 'all', label: 'All drinks' },
  { value: 'espresso', label: 'Espresso' },
  { value: 'latte', label: 'Latte' },
  { value: 'cappuccino', label: 'Cappuccino' },
  { value: 'americano', label: 'Americano' },
  { value: 'cold_brew', label: 'Cold brew' },
  { value: 'non_coffee', label: 'Non-coffee' },
];

function MenuContent() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CoffeeCategory | 'all'>('all');

  const menuQuery = useQuery({
    queryKey: ['menu'],
    queryFn: getMenu,
    staleTime: 30_000,
  });

  const coffees = menuQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();

  const filteredCoffees = coffees.filter(coffee => {
    const matchesCategory = category === 'all' || coffee.category === category;

    const searchableText = [coffee.name, coffee.description, coffee.category.replaceAll('_', ' ')]
      .join(' ')
      .toLowerCase();

    return matchesCategory && searchableText.includes(normalizedSearch);
  });

  const hasFilters = category !== 'all' || search.length > 0;

  function clearFilters() {
    setSearch('');
    setCategory('all');
  }

  return (
    <main className="min-h-screen bg-[#faf7f2] text-[#30251f]">
      <section className="border-b border-[#e7dfd5]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#886345]">The Caffeinawa menu</p>

            <h1 className="mt-5 font-serif text-5xl leading-[1.08] tracking-tight sm:text-6xl">
              Find your next
              <br />
              coffee moment.
            </h1>

            <p className="mt-5 max-w-lg text-base leading-7 text-[#75685e]">
              Something bold, something smooth, or something chilled. Find your favorite and make it yours.
            </p>
          </div>

          <Link
            href="/cart/"
            className="inline-flex min-h-12 w-fit items-center justify-center gap-3 rounded-full bg-[#38271f] px-6 text-sm font-semibold text-white transition hover:bg-[#543a2d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#886345]"
          >
            View your cart
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="menu-heading" className="mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="menu-heading" className="font-serif text-3xl tracking-tight">
              Made for your mood
            </h2>

            <p className="mt-2 text-sm text-[#75685e]">Explore the menu or find your usual.</p>
          </div>

          <div className="w-full sm:max-w-sm">
            <label
              htmlFor="menu-search"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#75685e]"
            >
              Find a drink
            </label>

            <input
              id="menu-search"
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search coffee, flavors, or a favorite..."
              className="min-h-12 w-full rounded-2xl border border-[#ded4c8] bg-white px-4 text-base text-[#30251f] outline-none transition placeholder:text-[#94877c] focus:border-[#886345] focus:ring-2 focus:ring-[#886345]/20"
            />
          </div>
        </div>

        <div role="group" aria-label="Filter drinks by category" className="mt-7 flex flex-wrap gap-2">
          {categories.map(item => (
            <button
              key={item.value}
              type="button"
              aria-pressed={category === item.value}
              onClick={() => setCategory(item.value)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#886345] ${
                category === item.value
                  ? 'border-[#38271f] bg-[#38271f] text-white'
                  : 'border-[#e3d9cd] bg-transparent text-[#75685e] hover:border-[#886345] hover:bg-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {menuQuery.isPending ? (
          <div
            role="status"
            className="mt-8 rounded-3xl border border-[#e7dfd5] bg-white px-6 py-14 text-center text-sm text-[#75685e]"
          >
            Brewing up the menu...
          </div>
        ) : menuQuery.isError ? (
          <div className="mt-8 rounded-3xl border border-red-200 bg-white p-8">
            <h3 className="text-lg font-semibold">We couldn&apos;t load the menu</h3>

            <p role="alert" className="mt-2 text-sm text-red-700">
              {menuQuery.error.message}
            </p>

            <button
              type="button"
              disabled={menuQuery.isFetching}
              onClick={() => void menuQuery.refetch()}
              className="mt-5 min-h-11 rounded-full bg-[#38271f] px-5 text-sm font-semibold text-white hover:bg-[#543a2d] disabled:opacity-50"
            >
              {menuQuery.isFetching ? 'Trying again...' : 'Try again'}
            </button>
          </div>
        ) : (
          <>
            <div className="my-6 flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-sm text-[#75685e]">
                {filteredCoffees.length} {filteredCoffees.length === 1 ? 'drink' : 'drinks'}
                {hasFilters ? ' matching your selection' : ' to explore'}
              </p>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 text-sm font-semibold text-[#6f4c35] underline decoration-[#c8b39d] underline-offset-4 hover:text-[#30251f]"
                >
                  Clear filters
                </button>
              )}
            </div>

            {coffees.length === 0 ? (
              <div className="rounded-3xl border border-[#e7dfd5] bg-white px-6 py-14 text-center">
                <h3 className="font-serif text-2xl">The menu is taking a little break</h3>

                <p className="mt-3 text-sm leading-6 text-[#75685e]">
                  No drinks have been added yet. Please check back soon.
                </p>
              </div>
            ) : filteredCoffees.length === 0 ? (
              <div className="rounded-3xl border border-[#e7dfd5] bg-white px-6 py-14 text-center">
                <h3 className="font-serif text-2xl">No drinks found</h3>

                <p className="mt-3 text-sm leading-6 text-[#75685e]">Try another search or explore the full menu.</p>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 min-h-11 rounded-full border border-[#ded4c8] px-5 text-sm font-semibold hover:bg-[#faf7f2]"
                >
                  Show all drinks
                </button>
              </div>
            ) : (
              <CoffeeGrid coffees={filteredCoffees} />
            )}
          </>
        )}
      </section>
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
