'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { Order } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { getOrder } from '@/lib/api/orders';

const CONFIRMATION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const presentations: Record<
  Order['status'],
  {
    label: string;
    heading: string;
    description: string;
  }
> = {
  pending: {
    label: 'Awaiting confirmation',
    heading: 'Your order is received.',
    description: 'Your order is awaiting confirmation. We’re checking for updates.',
  },
  confirmed: {
    label: 'Confirmed',
    heading: 'Your order is confirmed.',
    description: 'Your coffee moment is one step closer. Here are your order details.',
  },
  preparing: {
    label: 'Preparing',
    heading: 'Something good is brewing.',
    description: 'Your order is being prepared. Check back for its latest status.',
  },
  ready: {
    label: 'Ready',
    heading: 'Your order is ready.',
    description: 'Your drinks are ready. Keep your order reference handy.',
  },
  completed: {
    label: 'Completed',
    heading: 'Thanks for sharing a moment.',
    description: 'Your order is complete. We look forward to your next coffee moment.',
  },
  cancelled: {
    label: 'Cancelled',
    heading: 'This order was cancelled.',
    description: 'The order is marked as cancelled. This status does not confirm a refund.',
  },
};

function LoadingResult() {
  return (
    <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16">
      <p role="status" className="text-sm text-cafe-muted">
        Checking your order...
      </p>
    </main>
  );
}

interface OrderLookupProps {
  orderId: string;
  accessToken: string;
}

function OrderLookup({ orderId, accessToken }: OrderLookupProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [checking, setChecking] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stopped = false;
    let nextPoll: ReturnType<typeof setTimeout> | undefined;

    const deadline = setTimeout(() => {
      if (cancelled || stopped) return;

      stopped = true;

      if (nextPoll) clearTimeout(nextPoll);

      setTimedOut(true);
      setChecking(false);
      setLoadingOrder(false);
    }, CONFIRMATION_TIMEOUT_MS);

    async function checkOrder() {
      try {
        const result = await getOrder(accessToken, orderId);

        if (cancelled) return;

        setOrder(result);
        setError(null);

        if (result.status !== 'pending') {
          stopped = true;
          clearTimeout(deadline);
          setChecking(false);
          setTimedOut(false);
        } else if (!stopped) {
          nextPoll = setTimeout(() => {
            void checkOrder();
          }, POLL_INTERVAL_MS);
        }
      } catch (cause) {
        if (cancelled) return;

        stopped = true;
        clearTimeout(deadline);
        setChecking(false);

        setError(cause instanceof Error ? cause.message : 'Unable to check your order.');
      } finally {
        if (!cancelled) {
          setLoadingOrder(false);
        }
      }
    }

    void checkOrder();

    return () => {
      cancelled = true;
      stopped = true;
      clearTimeout(deadline);

      if (nextPoll) clearTimeout(nextPoll);
    };
  }, [accessToken, orderId, refreshCount]);

  function refreshStatus() {
    if (checking) return;

    setError(null);
    setTimedOut(false);
    setChecking(true);
    setLoadingOrder(order === null);
    setRefreshCount(count => count + 1);
  }

  if (loadingOrder && !order) {
    return <LoadingResult />;
  }

  const presentation = order ? presentations[order.status] : null;

  return (
    <main className="flex-1 bg-cafe-cream px-5 py-12 text-cafe-espresso sm:py-16">
      <div className="mx-auto max-w-2xl">
        <section className="overflow-hidden rounded-3xl border border-cafe-border bg-cafe-paper">
          <div className="border-b border-cafe-border px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">
              Your Caffeinawa order
            </p>

            {presentation && (
              <span
                className={`mt-5 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  order?.status === 'cancelled'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : order?.status === 'pending'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-cafe-border bg-cafe-soft text-cafe-brown'
                }`}
              >
                {presentation.label}
              </span>
            )}

            <h1 className="mt-5 font-display text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
              {presentation?.heading ?? 'Let’s check your order.'}
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-7 text-cafe-muted">
              {presentation?.description ??
                'Your order details are temporarily unavailable. You can try checking again.'}
            </p>
          </div>

          <div className="px-6 py-7 sm:px-10">
            <dl className="space-y-5">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-cafe-muted">Order reference</dt>

                <dd className="mt-2 break-all font-mono text-sm">{order?.id ?? orderId}</dd>
              </div>

              {order && (
                <div className="flex items-center justify-between gap-4 border-t border-cafe-border pt-5">
                  <dt className="text-sm font-medium">Order total</dt>

                  <dd className="text-2xl font-semibold tabular-nums">{currencyFormatter.format(order.total)}</dd>
                </div>
              )}
            </dl>

            {checking && order && (
              <p role="status" className="mt-5 text-sm text-cafe-muted">
                Checking for an update...
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
              >
                {error}
              </p>
            )}

            {timedOut && (
              <div
                role="status"
                className="mt-5 rounded-xl border border-cafe-border bg-cafe-cream p-4 text-sm leading-7 text-cafe-brown"
              >
                We&apos;re still waiting for an update. You can check again without placing another order.
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={checking}
                onClick={refreshStatus}
                className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-cafe-espresso px-5 text-sm font-semibold text-white hover:bg-cafe-brown disabled:opacity-50"
              >
                {checking ? 'Checking...' : 'Refresh order status'}
              </button>

              <Link
                href="/menu"
                className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-cafe-border px-5 text-sm font-semibold hover:bg-cafe-soft"
              >
                Back to the menu
              </Link>
            </div>

            <p className="mt-5 text-xs leading-6 text-cafe-muted">
              Keep your order reference for any questions about this order.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const { customer, accessToken, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingResult />;
  }

  if (!orderId) {
    return (
      <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16 text-cafe-espresso">
        <section className="w-full max-w-lg rounded-3xl border border-cafe-border bg-cafe-paper p-8 text-center">
          <h1 className="font-display text-3xl">Order reference missing</h1>

          <p className="mt-4 text-sm leading-7 text-cafe-muted">
            Open the complete order-status link to check your order.
          </p>

          <Link
            href="/menu"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Back to the menu
          </Link>
        </section>
      </main>
    );
  }

  if (!isAuthenticated || !customer || !accessToken) {
    return (
      <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16 text-cafe-espresso">
        <section className="w-full max-w-lg rounded-3xl border border-cafe-border bg-cafe-paper p-8 text-center">
          <h1 className="font-display text-3xl">Sign in to check your order</h1>

          <p className="mt-4 text-sm leading-7 text-cafe-muted">
            Use the account that placed this order. After signing in, reopen this order-status link.
          </p>

          <Link
            href="/login"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  return <OrderLookup key={`${customer.id}:${orderId}`} orderId={orderId} accessToken={accessToken} />;
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<LoadingResult />}>
      <SuccessContent />
    </Suspense>
  );
}
