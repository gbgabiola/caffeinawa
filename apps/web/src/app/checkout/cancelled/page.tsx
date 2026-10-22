'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function CancelledContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  return (
    <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-12 text-cafe-espresso sm:py-16">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-cafe-border bg-cafe-paper">
        <div className="border-b border-cafe-border px-6 py-8 sm:px-9">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">
            Your coffee moment can wait
          </p>

          <h1 className="mt-5 font-display text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
            Back from checkout.
          </h1>

          <p className="mt-4 text-sm leading-7 text-cafe-muted">
            Before starting another checkout, check the latest status of your order.
          </p>
        </div>

        <div className="px-6 py-7 sm:px-9">
          {orderId ? (
            <>
              <dl className="rounded-xl bg-cafe-cream p-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-cafe-muted">Order reference</dt>

                <dd className="mt-2 break-all font-mono text-sm">{orderId}</dd>
              </dl>

              <Link
                href={`/checkout/success?orderId=${encodeURIComponent(orderId)}`}
                className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-6 text-sm font-semibold text-white hover:bg-cafe-brown"
              >
                Check order status
              </Link>

              <p className="mt-4 text-xs leading-6 text-cafe-muted">
                Returning to this page does not confirm whether your payment completed or your order was cancelled.
              </p>
            </>
          ) : (
            <p className="text-sm leading-7 text-cafe-muted">
              No order reference was included in this link. Keep any reference provided during checkout if you need help
              checking an order.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/cart"
              className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-cafe-border px-5 text-sm font-semibold hover:bg-cafe-soft"
            >
              View your cart
            </Link>

            <Link
              href="/menu"
              className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-cafe-border px-5 text-sm font-semibold hover:bg-cafe-soft"
            >
              Back to the menu
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function CheckoutCancelledPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center bg-cafe-cream px-5 py-16">
          <p role="status" className="text-sm text-cafe-muted">
            Loading checkout details...
          </p>
        </main>
      }
    >
      <CancelledContent />
    </Suspense>
  );
}
