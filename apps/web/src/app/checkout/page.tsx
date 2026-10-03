'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Cart, PaymentProvider } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { checkoutCart, getCart, isPayMongoCheckoutResponse } from '@/lib/api/cart';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export default function CheckoutPage() {
  const router = useRouter();
  const { customer, accessToken, isAuthenticated, isLoading } = useAuth();

  const [cart, setCart] = useState<Cart | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated || !customer || !accessToken) {
      return;
    }

    const currentCustomer = customer;
    const currentAccessToken = accessToken;
    let cancelled = false;

    async function loadCart() {
      setLoadingCart(true);
      setError(null);

      try {
        const result = await getCart(currentAccessToken, currentCustomer.id);

        if (cancelled) {
          return;
        }

        if (result.items.length === 0) {
          router.replace('/cart');
          return;
        }

        setCart(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load your cart.');
        }
      } finally {
        if (!cancelled) {
          setLoadingCart(false);
        }
      }
    }

    void loadCart();

    return () => {
      cancelled = true;
    };
  }, [accessToken, customer, isAuthenticated, isLoading, router]);

  async function handleCheckout() {
    if (!customer || !accessToken || !cart) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await checkoutCart(accessToken, customer.id, paymentProvider);

      if (isPayMongoCheckoutResponse(result)) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      router.replace(`/checkout/success?orderId=${encodeURIComponent(result.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place your order.');
      setSubmitting(false);
    }
  }

  if (isLoading || loadingCart) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <p className="text-sm text-gray-500">Preparing checkout...</p>
      </main>
    );
  }

  if (!isAuthenticated || !customer || !accessToken) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Sign in to checkout</h1>

          <p className="mt-2 text-gray-600">You need to be signed in before placing an order.</p>

          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-700"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!cart) {
    return null;
  }

  const hasUnavailableItem = cart.items.some(item => !item.coffee.available);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">Checkout</h1>
        <p className="mt-1 text-gray-600">Confirm your order and choose how you want to pay.</p>
      </div>

      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Payment method</h2>

            <div className="mt-5 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                <input
                  type="radio"
                  name="payment-provider"
                  value="cash"
                  checked={paymentProvider === 'cash'}
                  onChange={() => setPaymentProvider('cash')}
                  disabled={submitting}
                  className="mt-1"
                />

                <span>
                  <span className="block font-medium text-gray-900">Cash</span>
                  <span className="mt-1 block text-sm text-gray-500">Pay for your order in cash.</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                <input
                  type="radio"
                  name="payment-provider"
                  value="paymongo"
                  checked={paymentProvider === 'paymongo'}
                  onChange={() => setPaymentProvider('paymongo')}
                  disabled={submitting}
                  className="mt-1"
                />

                <span>
                  <span className="block font-medium text-gray-900">PayMongo</span>
                  <span className="mt-1 block text-sm text-gray-500">
                    Continue to PayMongo to complete your payment.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Items</h2>

            <div className="mt-5 divide-y divide-gray-100">
              {cart.items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium text-gray-900">{item.coffee.name}</p>
                    <p className="text-sm text-gray-500">
                      {item.quantity} × {currencyFormatter.format(item.coffee.price)}
                    </p>
                  </div>

                  <p className="font-medium text-gray-900">{currencyFormatter.format(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Order Summary</h2>

          <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-5">
            <span className="text-gray-600">Total</span>
            <span className="text-xl font-semibold text-gray-900">{currencyFormatter.format(cart.total)}</span>
          </div>

          {hasUnavailableItem && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              One or more items are no longer available. Return to your cart and remove them before checking out.
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleCheckout()}
            disabled={submitting || hasUnavailableItem}
            className="mt-6 w-full rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {submitting
              ? paymentProvider === 'paymongo'
                ? 'Redirecting...'
                : 'Placing order...'
              : paymentProvider === 'paymongo'
                ? 'Continue to PayMongo'
                : 'Place order'}
          </button>

          <Link href="/cart" className="mt-3 block text-center text-sm font-medium text-gray-600 hover:text-gray-900">
            Back to cart
          </Link>
        </aside>
      </div>
    </main>
  );
}
