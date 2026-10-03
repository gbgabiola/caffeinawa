'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CancelledContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  return (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-700">
          !
        </div>

        <p className="mt-6 text-sm font-medium text-gray-500">Caffeinawa</p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">Checkout cancelled</h1>

        <p className="mt-3 text-gray-600">
          Your payment checkout was cancelled before payment confirmation. You can return to checkout and try again.
        </p>

        {orderId && (
          <div className="mt-6 rounded-xl bg-gray-50 p-4 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Order</p>
            <p className="mt-1 break-all text-sm font-medium text-gray-900">{orderId}</p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/checkout"
            className="flex-1 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Return to checkout
          </Link>

          <Link
            href="/menu"
            className="flex-1 rounded-lg border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Return to menu
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function CheckoutCancelledPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-16">
          <p className="text-sm text-gray-600">Loading...</p>
        </main>
      }
    >
      <CancelledContent />
    </Suspense>
  );
}
