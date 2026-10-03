'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { Order } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { getOrder } from '@/lib/api/orders';

const PAYMENT_CONFIRMATION_TIMEOUT_MS = 30_000;
const PAYMENT_POLL_INTERVAL_MS = 2_000;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(value);
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const { accessToken, isLoading } = useAuth();

  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!accessToken || !orderId) {
      return;
    }

    try {
      const currentOrder = await getOrder(accessToken, orderId);

      setOrder(currentOrder);
      setError(null);

      return currentOrder;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load order.');
      return null;
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    if (isLoading || !accessToken || !orderId) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function checkPaymentStatus() {
      const currentOrder = await loadOrder();

      if (cancelled) {
        return;
      }

      if (currentOrder && currentOrder.status !== 'pending' && currentOrder.status !== 'cancelled') {
        setIsChecking(false);

        if (intervalId) {
          clearInterval(intervalId);
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        return;
      }

      setIsChecking(true);
    }

    void checkPaymentStatus();

    intervalId = setInterval(() => {
      void checkPaymentStatus();
    }, PAYMENT_POLL_INTERVAL_MS);

    timeoutId = setTimeout(() => {
      if (cancelled) {
        return;
      }

      setTimedOut(true);
      setIsChecking(false);

      if (intervalId) {
        clearInterval(intervalId);
      }
    }, PAYMENT_CONFIRMATION_TIMEOUT_MS);

    return () => {
      cancelled = true;

      if (intervalId) {
        clearInterval(intervalId);
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [accessToken, isLoading, loadOrder, orderId]);

  if (isLoading) {
    return (
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
        <p className="text-sm text-gray-600">Checking your order...</p>
      </main>
    );
  }

  if (!accessToken) {
    return (
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Order received</h1>

          <p className="mt-3 text-gray-600">Sign in to view the current status of your order.</p>

          <Link
            href="/login"
            className="mt-6 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!orderId) {
    return (
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-red-900">Order information is missing</h1>

          <p className="mt-3 text-sm text-red-700">We could not determine which order this checkout belongs to.</p>

          <Link
            href="/menu"
            className="mt-6 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Return to menu
          </Link>
        </div>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-red-900">Unable to load your order</h1>

          <p className="mt-3 text-sm text-red-700">{error}</p>

          <Link
            href="/account"
            className="mt-6 inline-flex rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Go to account
          </Link>
        </div>
      </main>
    );
  }

  const isConfirmed =
    order?.status === 'confirmed' ||
    order?.status === 'preparing' ||
    order?.status === 'ready' ||
    order?.status === 'completed';

  const isCancelled = order?.status === 'cancelled';

  return (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        {isConfirmed ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-xl text-green-700">
              ✓
            </div>

            <p className="mt-6 text-sm font-medium text-gray-500">Caffeinawa</p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Payment confirmed</h1>

            <p className="mt-3 text-gray-600">Your payment has been confirmed and your order is now being processed.</p>
          </>
        ) : isCancelled ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl text-red-700">
              !
            </div>

            <p className="mt-6 text-sm font-medium text-gray-500">Caffeinawa</p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Order cancelled</h1>

            <p className="mt-3 text-gray-600">This order has been cancelled and the payment was not confirmed.</p>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700">
              …
            </div>

            <p className="mt-6 text-sm font-medium text-gray-500">Caffeinawa</p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Payment processing</h1>

            <p className="mt-3 text-gray-600">
              Your checkout was completed, but payment confirmation is still being processed. We&apos;re checking the
              order status automatically.
            </p>
          </>
        )}

        {order && (
          <div className="mt-8 rounded-xl bg-gray-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Order</p>
                <p className="mt-1 break-all text-sm font-medium text-gray-900">{order.id}</p>
              </div>

              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(order.total)}</p>
              </div>
            </div>

            <div className="mt-4 border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600">
                Status: <span className="font-medium capitalize text-gray-900">{order.status}</span>
              </p>
            </div>
          </div>
        )}

        {timedOut && !isConfirmed && !isCancelled && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Payment confirmation is taking longer than expected. Your order has not been treated as paid based on the
            redirect alone. You can check your account again shortly.
          </div>
        )}

        {error && order && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {isChecking && <p className="mt-4 text-center text-xs text-gray-500">Waiting for payment confirmation...</p>}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/account"
            className="flex-1 rounded-lg border border-gray-300 px-5 py-3 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            View account
          </Link>

          <Link
            href="/menu"
            className="flex-1 rounded-lg bg-black px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
          <p className="text-sm text-gray-600">Loading order...</p>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
