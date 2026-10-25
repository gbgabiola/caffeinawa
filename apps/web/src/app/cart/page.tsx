'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { Cart } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { clearCart, getCart, removeCartItem, updateCartItem } from '@/lib/api/cart';
import { notifyCartChanged } from '@/lib/cart-events';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

interface CustomerCartProps {
  customerId: string;
  accessToken: string;
}

function CustomerCart({ customerId, accessToken }: CustomerCartProps) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
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

  async function changeQuantity(itemId: string, quantity: number) {
    if (busyAction) return;

    setBusyAction(itemId);
    setError(null);

    try {
      const result =
        quantity < 1
          ? await removeCartItem(accessToken, customerId, itemId)
          : await updateCartItem(accessToken, customerId, itemId, quantity);

      setCart(result);
      notifyCartChanged(customerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the cart item.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClearCart() {
    if (busyAction) return;

    setBusyAction('clear');
    setError(null);

    try {
      setCart(await clearCart(accessToken, customerId));
      notifyCartChanged(customerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear your cart.');
    } finally {
      setBusyAction(null);
    }
  }

  const items = cart?.items ?? [];
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const isBusy = busyAction !== null;
  const hasUnavailableItem = items.some(item => !item.coffee.available);
  const cannotCheckout = isBusy || hasUnavailableItem;

  return (
    <main className="flex-1 bg-cafe-cream text-cafe-espresso">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href="/menu"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-cafe-muted hover:text-cafe-espresso"
        >
          <span aria-hidden="true">←</span>
          Back to the menu
        </Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">Your coffee moment</p>

            <h1 className="mt-3 font-display text-4xl tracking-[-0.04em] sm:text-5xl">A little cup of happy.</h1>

            <p className="mt-3 text-sm leading-7 text-cafe-muted">Review your drinks before heading to checkout.</p>
          </div>

          {!loadingCart && items.length > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleClearCart()}
              className="min-h-11 text-sm font-medium text-cafe-muted underline underline-offset-4 hover:text-cafe-espresso disabled:opacity-50"
            >
              {busyAction === 'clear' ? 'Clearing...' : 'Clear cart'}
            </button>
          )}
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
            Loading your cart...
          </p>
        ) : !cart ? (
          <section className="mt-8 rounded-2xl border border-cafe-border bg-cafe-paper p-8 text-center">
            <h2 className="font-display text-2xl">We couldn&apos;t open your cart</h2>

            <button
              type="button"
              onClick={() => setRefreshCount(count => count + 1)}
              className="mt-5 min-h-12 rounded-full bg-cafe-espresso px-6 text-sm font-semibold text-white hover:bg-cafe-brown"
            >
              Try again
            </button>
          </section>
        ) : items.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-cafe-border bg-cafe-paper px-6 py-16 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cafe-accent">
              Room for something good
            </p>

            <h2 className="mt-4 font-display text-3xl">Your cart is waiting.</h2>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-cafe-muted">
              Explore the menu and add something you&apos;ll look forward to.
            </p>

            <Link
              href="/menu"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
            >
              Explore the menu
            </Link>
          </section>
        ) : (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-label="Cart items" className="space-y-4">
              {items.map(item => {
                const updating = busyAction === item.id;

                return (
                  <article key={item.id} className="rounded-2xl border border-cafe-border bg-cafe-paper p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="break-words font-display text-2xl tracking-tight">{item.coffee.name}</h2>

                        <p className="mt-2 text-sm text-cafe-muted">
                          {currencyFormatter.format(item.coffee.price)} per drink
                        </p>

                        {!item.coffee.available && (
                          <p className="mt-3 text-sm font-medium text-red-700">Currently unavailable</p>
                        )}
                      </div>

                      <p className="shrink-0 text-lg font-semibold tabular-nums">
                        {currencyFormatter.format(item.subtotal)}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-cafe-border pt-4">
                      <div
                        role="group"
                        aria-label={`Quantity for ${item.coffee.name}`}
                        aria-busy={updating}
                        className="flex items-center rounded-full border border-cafe-border bg-cafe-cream"
                      >
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${item.coffee.name}`}
                          disabled={isBusy}
                          onClick={() => void changeQuantity(item.id, item.quantity - 1)}
                          className="flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-cafe-soft disabled:opacity-40"
                        >
                          <span aria-hidden="true">−</span>
                        </button>

                        <span aria-live="polite" className="min-w-9 text-center text-sm font-semibold tabular-nums">
                          {updating ? '…' : item.quantity}
                        </span>

                        <button
                          type="button"
                          aria-label={`Increase quantity of ${item.coffee.name}`}
                          disabled={isBusy || !item.coffee.available}
                          onClick={() => void changeQuantity(item.id, item.quantity + 1)}
                          className="flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-cafe-soft disabled:opacity-40"
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void changeQuantity(item.id, 0)}
                        className="min-h-11 text-sm text-cafe-muted underline underline-offset-4 hover:text-red-700 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside
              aria-labelledby="cart-summary-heading"
              className="rounded-2xl border border-cafe-border bg-cafe-paper p-6 lg:sticky lg:top-6"
            >
              <h2 id="cart-summary-heading" className="font-display text-2xl">
                Your order
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
                  Remove unavailable drinks before continuing.
                </p>
              )}

              <Link
                href="/checkout"
                aria-disabled={cannotCheckout}
                tabIndex={cannotCheckout ? -1 : undefined}
                onClick={event => {
                  if (cannotCheckout) event.preventDefault();
                }}
                className={`mt-6 flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold ${
                  cannotCheckout
                    ? 'cursor-not-allowed bg-cafe-soft text-cafe-muted'
                    : 'bg-cafe-espresso text-white hover:bg-cafe-brown'
                }`}
              >
                Continue to checkout
              </Link>

              <Link
                href="/menu"
                className="mt-3 flex min-h-11 items-center justify-center text-sm font-medium text-cafe-muted hover:text-cafe-espresso"
              >
                Add another favorite
              </Link>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

export default function CartPage() {
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
          <h1 className="font-display text-3xl">Sign in to view your cart</h1>

          <p className="mt-4 text-sm leading-7 text-cafe-muted">Your next coffee moment starts with your account.</p>

          <Link
            href="/login?next=%2Fcart"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-cafe-espresso px-7 text-sm font-semibold text-white hover:bg-cafe-brown"
          >
            Sign in
          </Link>
        </section>
      </main>
    );
  }

  return <CustomerCart key={customer.id} customerId={customer.id} accessToken={accessToken} />;
}
