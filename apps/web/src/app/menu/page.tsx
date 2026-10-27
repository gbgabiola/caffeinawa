'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';

import type { CoffeeCategory } from '@caffeinawa/types';

import { CoffeeGrid } from '@/components/coffee/CoffeeGrid';
import MenuCartSync from '@/components/coffee/MenuCartSync';
import QueryProvider from '@/components/providers/QueryProvider';
import StoreOrderingNotice from '@/features/store/StoreOrderingNotice';
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
    <main className="flex-1 bg-cafe-cream text-cafe-espresso">
      <section className="relative isolate overflow-hidden border-b border-cafe-border">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/images/menu-hero.png"
            alt=""
            fill
            unoptimized
            loading="eager"
            sizes="100vw"
            className="object-cover object-[68%_center] md:object-center"
          />

          <div className="absolute inset-0 bg-linear-to-r from-cafe-cream via-cafe-cream/90 to-cafe-cream/20 md:via-cafe-cream/60 md:to-transparent" />
        </div>

        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cafe-accent">
              The Caffeinawa menu
            </p>

            <h1 className="mt-5 font-display text-[clamp(2.75rem,5.8vw,5.25rem)] leading-[1.03] tracking-[-0.055em]">
              Good coffee.
              <br />
              Your kind of moment.
            </h1>

            <p className="mt-6 max-w-sm text-sm leading-7 text-cafe-brown sm:text-base">
              Something bold, something smooth, or something chilled. Find your favorite and make it yours.
            </p>

            <a
              href="#coffee-menu"
              className="mt-7 inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-cafe-espresso underline decoration-cafe-accent underline-offset-8"
            >
              Explore the menu
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </section>

      <section
        id="coffee-menu"
        aria-labelledby="menu-heading"
        className="mx-auto max-w-7xl scroll-mt-6 px-5 py-9 sm:px-8 sm:py-12"
      >
        <div className="mb-6">
          <StoreOrderingNotice />
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="menu-heading" className="font-display text-3xl tracking-[-0.04em] sm:text-4xl">
            Find your favorite
          </h2>

          <div className="relative w-full sm:max-w-sm">
            <label htmlFor="menu-search" className="sr-only">
              Search the menu
            </label>

            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cafe-muted"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4 4" strokeLinecap="round" />
            </svg>

            <input
              id="menu-search"
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search the menu"
              className="min-h-12 w-full rounded-full border border-cafe-border bg-cafe-paper py-3 pl-12 pr-4 text-base text-cafe-espresso placeholder:text-cafe-muted sm:text-sm"
            />
          </div>
        </div>

        <div role="group" aria-label="Filter drinks by category" className="mt-6 flex gap-2 overflow-x-auto pb-3">
          {categories.map(item => (
            <button
              key={item.value}
              type="button"
              aria-pressed={category === item.value}
              onClick={() => setCategory(item.value)}
              className={`min-h-11 shrink-0 rounded-full border px-5 text-sm font-medium transition-colors ${
                category === item.value
                  ? 'border-cafe-accent bg-cafe-accent text-white'
                  : 'border-cafe-border bg-transparent text-cafe-brown hover:border-cafe-accent hover:bg-cafe-paper'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {menuQuery.isPending ? (
          <div
            role="status"
            className="mt-6 rounded-2xl border border-cafe-border bg-cafe-paper px-6 py-16 text-center text-sm text-cafe-muted"
          >
            Brewing up the menu...
          </div>
        ) : menuQuery.isError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-cafe-paper p-8">
            <h3 className="font-display text-2xl">We couldn&apos;t load the menu</h3>

            <p role="alert" className="mt-3 text-sm text-red-700">
              {menuQuery.error.message}
            </p>

            <button
              type="button"
              disabled={menuQuery.isFetching}
              onClick={() => void menuQuery.refetch()}
              className="mt-5 min-h-11 rounded-full bg-cafe-espresso px-5 text-sm font-semibold text-white hover:bg-cafe-brown disabled:opacity-50"
            >
              {menuQuery.isFetching ? 'Trying again...' : 'Try again'}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 mt-3 flex min-h-11 items-center justify-between gap-4">
              <p role="status" className="text-sm text-cafe-muted">
                {filteredCoffees.length} {filteredCoffees.length === 1 ? 'drink' : 'drinks'}
                {hasFilters ? ' matching your selection' : ' to explore'}
              </p>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 shrink-0 text-sm font-semibold text-cafe-accent underline underline-offset-4"
                >
                  Clear filters
                </button>
              )}
            </div>

            {coffees.length === 0 ? (
              <div className="rounded-2xl border border-cafe-border bg-cafe-paper px-6 py-16 text-center">
                <h3 className="font-display text-2xl">The menu is taking a little break</h3>

                <p className="mt-3 text-sm leading-6 text-cafe-muted">
                  No drinks have been added yet. Please check back soon.
                </p>
              </div>
            ) : filteredCoffees.length === 0 ? (
              <div className="rounded-2xl border border-cafe-border bg-cafe-paper px-6 py-16 text-center">
                <h3 className="font-display text-2xl">No drinks found</h3>

                <p className="mt-3 text-sm leading-6 text-cafe-muted">Try another search or explore the full menu.</p>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 min-h-11 rounded-full border border-cafe-border px-5 text-sm font-semibold hover:bg-cafe-soft"
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
      <MenuCartSync />
      <MenuContent />
    </QueryProvider>
  );
}
