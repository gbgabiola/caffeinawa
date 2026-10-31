'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { Order } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { getOrders } from '@/lib/api/orders';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
});

const statusLabels: Record<Order['status'], string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface CustomerOrdersProps {
  accessToken: string;
}

function CustomerOrders({ accessToken }: CustomerOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      setLoading(true);
      setError(null);

      try {
        const result = await getOrders(accessToken);

        if (!cancelled) {
          setOrders(result);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load your orders.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshCount]);

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-cafe-muted">Dates are shown in Philippine time.</p>

        <button
          type="button"
          disabled={loading}
          onClick={() => setRefreshCount(count => count + 1)}
          className="min-h-11 rounded-full border border-cafe-border px-5 text-sm font-semibold hover:bg-cafe-soft disabled:opacity-50"
        >
          Refresh orders
        </button>
      </div>

      {loading ? (
        <p
          role="status"
          className="mt-6 rounded-2xl border border-cafe-border bg-cafe-paper px-6 py-14 text-center text-sm text-cafe-muted"
        >
          Loading your orders...
        </p>
      ) : error ? (
        <section className="mt-6 rounded-2xl border border-cafe-border bg-cafe-paper p-6">
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>

          <button
            type="button"
            onClick={() => setRefreshCount(count => count + 1)}
            className="mt-5 min-h-11 rounded-full bg-cafe-espresso px-6 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Try again
          </button>
        </section>
      ) : orders.length === 0 ? (
        <section className="mt-6 rounded-3xl border border-cafe-border bg-cafe-paper px-6 py-14 text-center">
          <h2 className="font-display text-3xl">Your first order awaits.</h2>

          <p className="mt-3 text-sm leading-7 text-cafe-muted">Your orders will appear here after checkout.</p>

          <Link
            href="/menu"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Explore the menu
          </Link>
        </section>
      ) : (
        <ul aria-label="Your orders" className="mt-6 space-y-4">
          {orders.map(order => {
            const drinkCount = order.items.reduce((total, item) => total + item.quantity, 0);

            return (
              <li key={order.id}>
                <article className="rounded-2xl border border-cafe-border bg-cafe-paper p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold">
                        Order reference
                        <span className="mt-2 block break-all font-mono text-xs font-normal">{order.id}</span>
                      </h2>

                      <time dateTime={order.createdAt} className="mt-3 block text-sm text-cafe-muted">
                        {dateFormatter.format(new Date(order.createdAt))}
                      </time>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        order.status === 'cancelled' ? 'bg-red-50 text-red-700' : 'bg-cafe-soft text-cafe-brown'
                      }`}
                    >
                      {statusLabels[order.status]}
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-cafe-border pt-5">
                    <div>
                      <p className="text-sm text-cafe-muted">
                        {drinkCount} {drinkCount === 1 ? 'drink' : 'drinks'}
                      </p>

                      <p className="mt-1 text-xl font-semibold tabular-nums">{currencyFormatter.format(order.total)}</p>
                    </div>

                    <Link
                      href={`/checkout/success?orderId=${encodeURIComponent(order.id)}`}
                      aria-label={`View order ${order.id}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-cafe-border px-5 text-sm font-semibold hover:bg-cafe-soft"
                    >
                      View order
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function OrdersPage() {
  const { customer, accessToken, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16">
        <p role="status" className="text-sm text-cafe-muted">
          Checking your session...
        </p>
      </main>
    );
  }

  if (!isAuthenticated || !customer || !accessToken) {
    return (
      <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16 text-cafe-espresso">
        <section className="w-full max-w-lg rounded-3xl border border-cafe-border bg-cafe-paper p-8 text-center">
          <h1 className="font-display text-3xl">Sign in to view your orders</h1>

          <p className="mt-4 text-sm leading-7 text-cafe-muted">
            Find your previous orders and check their latest status.
          </p>

          <Link
            href="/login?next=%2Forders"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-cafe-cream text-cafe-espresso">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">Your coffee moments</p>

        <h1 className="mt-3 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Your orders.</h1>

        <p className="mt-4 text-sm leading-7 text-cafe-muted">
          Check an existing order before starting another checkout. Order status does not confirm payment or a refund.
        </p>

        <CustomerOrders key={`${customer.id}:${accessToken}`} accessToken={accessToken} />
      </div>
    </main>
  );
}
