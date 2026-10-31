'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/components/auth/AuthProvider';
import QueryProvider from '@/components/providers/QueryProvider';
import StoreOrderingNotice from '@/features/store/StoreOrderingNotice';
import { useStoreOrdering } from '@/hooks/useStoreOrdering';
import { checkoutCart, getCart, isPayMongoCheckoutResponse, PaymentCheckoutUnavailableError } from '@/lib/api/cart';
import { notifyCartChanged } from '@/lib/cart-events';

import type { Cart, PaymentProvider } from '@caffeinawa/types';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const paymentMethods: {
  value: PaymentProvider;
  title: string;
  description: string;
}[] = [
  {
    value: 'cash',
    title: 'Cash',
    description: 'Pay for your order in cash.',
  },
  {
    value: 'paymongo',
    title: 'PayMongo',
    description: 'Continue to hosted checkout to complete payment.',
  },
];

const NO_PAYMENT_METHODS: readonly PaymentProvider[] = [];

interface CustomerCheckoutProps {
  customerId: string;
  accessToken: string;
}

function CustomerCheckout({ customerId, accessToken }: CustomerCheckoutProps) {
  const router = useRouter();
  const ordering = useStoreOrdering();

  const acceptingOrders = ordering.data?.acceptingOrders === true && !ordering.isError;

  const enabledPaymentMethods: readonly PaymentProvider[] =
    !ordering.isPending && !ordering.isError
      ? (ordering.data?.paymentMethods ?? NO_PAYMENT_METHODS)
      : NO_PAYMENT_METHODS;

  const availablePaymentMethods = paymentMethods.filter(method => enabledPaymentMethods.includes(method.value));

  const checkoutInFlight = useRef(false);

  const [cart, setCart] = useState<Cart | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('cash');
  const selectedPaymentProvider = enabledPaymentMethods.includes(paymentProvider)
    ? paymentProvider
    : availablePaymentMethods[0]?.value;

  const canCheckout = acceptingOrders && selectedPaymentProvider !== undefined;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCart() {
      setLoadingCart(true);
      setError(null);

      try {
        const result = await getCart(accessToken, customerId);

        if (!cancelled) {
          setCart(result);
        }
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
  }, [accessToken, customerId, refreshCount]);

  const hasUnavailableItem = cart?.items.some(item => !item.coffee.available) ?? false;

  async function handleCheckout() {
    if (
      !cart ||
      cart.items.length === 0 ||
      !canCheckout ||
      !selectedPaymentProvider ||
      hasUnavailableItem ||
      checkoutInFlight.current
    ) {
      return;
    }

    checkoutInFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const result = await checkoutCart(accessToken, customerId, selectedPaymentProvider);
      notifyCartChanged(customerId);

      if (isPayMongoCheckoutResponse(result)) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      router.replace(`/checkout/success?orderId=${encodeURIComponent(result.id)}`);
    } catch (err) {
      if (err instanceof PaymentCheckoutUnavailableError) {
        // The server created the order and cleared the cart.
        notifyCartChanged(customerId);

        router.replace(`/checkout/success?orderId=${encodeURIComponent(err.orderId)}&paymentCheckout=unavailable`);

        return;
      }

      checkoutInFlight.current = false;
      setSubmitting(false);

      setError(err instanceof Error ? err.message : 'Unable to place your order.');
    }
  }

  const itemCount = cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;

  return (
    <main className="flex-1 bg-cafe-cream text-cafe-espresso">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        {submitting ? (
          <p role="status" className="min-h-11 text-sm text-cafe-muted">
            Completing your checkout...
          </p>
        ) : (
          <Link
            href="/cart"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-cafe-muted hover:text-cafe-espresso"
          >
            <span aria-hidden="true">←</span>
            Back to your cart
          </Link>
        )}

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">One step closer</p>

        <h1 className="mt-3 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Make it your moment.</h1>

        <p className="mt-3 text-sm leading-7 text-cafe-muted">
          Review your drinks and choose how you&apos;d like to pay.
        </p>

        <div className="mt-6">
          <StoreOrderingNotice />
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {loadingCart ? (
          <p
            role="status"
            className="mt-8 rounded-2xl border border-cafe-border bg-cafe-paper px-6 py-14 text-center text-sm text-cafe-muted"
          >
            Preparing checkout...
          </p>
        ) : !cart ? (
          <section className="mt-8 rounded-2xl border border-cafe-border bg-cafe-paper p-8 text-center">
            <h2 className="font-display text-2xl">We couldn&apos;t prepare checkout</h2>

            <button
              type="button"
              onClick={() => setRefreshCount(count => count + 1)}
              className="mt-5 min-h-12 rounded-full bg-cafe-espresso px-6 text-sm font-semibold text-white hover:bg-cafe-brown"
            >
              Try again
            </button>
          </section>
        ) : cart.items.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-cafe-border bg-cafe-paper px-6 py-14 text-center">
            <h2 className="font-display text-3xl">Your cart is empty</h2>

            <p className="mt-3 text-sm text-cafe-muted">Choose your drinks before continuing to checkout.</p>

            <Link
              href="/menu"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
            >
              Explore the menu
            </Link>
          </section>
        ) : (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <section
                aria-labelledby="payment-heading"
                className="rounded-2xl border border-cafe-border bg-cafe-paper p-5 sm:p-7"
              >
                <h2 id="payment-heading" className="font-display text-2xl">
                  How would you like to pay?
                </h2>

                <fieldset disabled={submitting} className="mt-5">
                  <legend className="sr-only">Payment method</legend>

                  <div className="grid gap-3">
                    {availablePaymentMethods.map(method => {
                      const selected = selectedPaymentProvider === method.value;

                      return (
                        <label
                          key={method.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                            selected ? 'border-cafe-accent bg-cafe-soft' : 'border-cafe-border hover:bg-cafe-cream'
                          } ${submitting ? 'cursor-wait opacity-70' : ''}`}
                        >
                          <input
                            type="radio"
                            name="payment-provider"
                            value={method.value}
                            checked={selected}
                            onChange={() => setPaymentProvider(method.value)}
                            className="mt-1 h-4 w-4 shrink-0 accent-cafe-accent"
                          />

                          <span>
                            <span className="block text-sm font-semibold">{method.title}</span>

                            <span className="mt-1 block text-sm leading-6 text-cafe-muted">{method.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {!ordering.isPending && !ordering.isError && availablePaymentMethods.length === 0 && (
                  <p role="status" className="mt-4 text-sm text-cafe-muted">
                    No payment methods are currently available.
                  </p>
                )}
              </section>

              <section
                aria-labelledby="checkout-items-heading"
                className="rounded-2xl border border-cafe-border bg-cafe-paper p-5 sm:p-7"
              >
                <h2 id="checkout-items-heading" className="font-display text-2xl">
                  Your selection
                </h2>

                <ul className="mt-4 divide-y divide-cafe-border">
                  {cart.items.map(item => (
                    <li key={item.id} className="flex items-start justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold">{item.coffee.name}</h3>

                        <p className="mt-2 text-sm text-cafe-muted">
                          {item.quantity} × {currencyFormatter.format(item.coffee.price)}
                        </p>

                        {!item.coffee.available && (
                          <p className="mt-2 text-sm font-medium text-red-700">Currently unavailable</p>
                        )}
                      </div>

                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {currencyFormatter.format(item.subtotal)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside
              aria-labelledby="checkout-summary-heading"
              className="rounded-2xl border border-cafe-border bg-cafe-paper p-6 lg:sticky lg:top-6"
            >
              <h2 id="checkout-summary-heading" className="font-display text-2xl">
                Order summary
              </h2>

              <div className="mt-5 flex justify-between gap-4 text-sm text-cafe-muted">
                <span>Drinks</span>
                <span>{itemCount}</span>
              </div>

              <div className="mt-5 flex items-center justify-between gap-4 border-t border-cafe-border pt-5">
                <span className="font-medium">Total</span>

                <span className="text-2xl font-semibold tabular-nums">{currencyFormatter.format(cart.total)}</span>
              </div>

              {hasUnavailableItem && (
                <p role="status" className="mt-5 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700">
                  Return to your cart and remove unavailable drinks before placing your order.
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={submitting || hasUnavailableItem || !canCheckout}
                className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-cafe-espresso px-5 text-sm font-semibold text-white hover:bg-cafe-brown disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? selectedPaymentProvider === 'paymongo'
                    ? 'Redirecting...'
                    : 'Placing order...'
                  : ordering.isPending
                    ? 'Checking availability...'
                    : ordering.isError
                      ? 'Ordering availability unavailable'
                      : !acceptingOrders
                        ? 'Ordering is closed'
                        : !selectedPaymentProvider
                          ? 'No payment methods available'
                          : selectedPaymentProvider === 'paymongo'
                            ? 'Continue to PayMongo'
                            : 'Place cash order'}
              </button>

              <p className="mt-4 text-center text-xs leading-6 text-cafe-muted">
                {selectedPaymentProvider === 'paymongo'
                  ? 'You will leave Caffeinawa to complete payment on PayMongo.'
                  : selectedPaymentProvider === 'cash'
                    ? 'Your order will be placed with cash as the payment method.'
                    : 'Choose an available payment method to continue.'}
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

export default function CheckoutPage() {
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
          <h1 className="font-display text-3xl">Sign in to checkout</h1>

          <p className="mt-4 text-sm leading-7 text-cafe-muted">Sign in to review your cart and place your order.</p>

          <Link
            href="/login?next=%2Fcheckout"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <QueryProvider>
      <CustomerCheckout key={customer.id} customerId={customer.id} accessToken={accessToken} />
    </QueryProvider>
  );
}
