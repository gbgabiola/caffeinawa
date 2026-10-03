'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { Cart } from '@caffeinawa/types';

import { clearCart, getCart, removeCartItem, updateCartItem } from '@/lib/api/cart';
import { useAuth } from '@/components/auth/AuthProvider';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export default function CartPage() {
  const { customer, accessToken, isAuthenticated, isLoading } = useAuth();

  const [cart, setCart] = useState<Cart | null>(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
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
  }, [accessToken, customer, isAuthenticated, isLoading]);

  async function changeQuantity(itemId: string, quantity: number) {
    if (!customer || !accessToken) {
      return;
    }

    if (quantity < 1) {
      await removeItem(itemId);
      return;
    }

    setUpdatingItemId(itemId);
    setError(null);

    try {
      const result = await updateCartItem(accessToken, customer.id, itemId, quantity);

      setCart(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the cart item.');
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function removeItem(itemId: string) {
    if (!customer || !accessToken) {
      return;
    }

    setUpdatingItemId(itemId);
    setError(null);

    try {
      const result = await removeCartItem(accessToken, customer.id, itemId);

      setCart(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the cart item.');
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function handleClearCart() {
    if (!customer || !accessToken) {
      return;
    }

    setClearing(true);
    setError(null);

    try {
      const result = await clearCart(accessToken, customer.id);
      setCart(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear your cart.');
    } finally {
      setClearing(false);
    }
  }

  if (isLoading || loadingCart) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <p className="text-sm text-gray-500">Loading your cart...</p>
      </main>
    );
  }

  if (!isAuthenticated || !customer || !accessToken) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Sign in to view your cart</h1>

          <p className="mt-2 text-gray-600">You need an account before you can place an order.</p>

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

  const items = cart?.items ?? [];
  const hasUnavailableItem = items.some(item => !item.coffee.available);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Your Cart</h1>
          <p className="mt-1 text-gray-600">Review your coffee before checkout.</p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={handleClearCart}
            disabled={clearing}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearing ? 'Clearing...' : 'Clear cart'}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900">Your cart is empty</h2>

          <p className="mt-2 text-gray-600">Add something from our coffee menu to get started.</p>

          <Link
            href="/menu"
            className="mt-6 inline-block rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-700"
          >
            Browse coffee
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="space-y-4">
            {items.map(item => {
              const updating = updatingItemId === item.id;

              return (
                <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-gray-900">{item.coffee.name}</h2>

                      <p className="mt-1 text-sm text-gray-500">{currencyFormatter.format(item.coffee.price)} each</p>

                      {!item.coffee.available && (
                        <p className="mt-2 text-sm font-medium text-red-600">Currently unavailable</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-5 sm:justify-end">
                      <div className="flex items-center rounded-lg border border-gray-200">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${item.coffee.name}`}
                          disabled={updating}
                          onClick={() => void changeQuantity(item.id, item.quantity - 1)}
                          className="px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          −
                        </button>

                        <span className="min-w-10 text-center text-sm font-medium">{item.quantity}</span>

                        <button
                          type="button"
                          aria-label={`Increase quantity of ${item.coffee.name}`}
                          disabled={updating}
                          onClick={() => void changeQuantity(item.id, item.quantity + 1)}
                          className="px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>

                      <p className="min-w-24 text-right font-semibold text-gray-900">
                        {currencyFormatter.format(item.subtotal)}
                      </p>

                      <button
                        type="button"
                        onClick={() => void removeItem(item.id)}
                        disabled={updating}
                        className="text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Order Summary</h2>

            <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-5">
              <span className="text-gray-600">Total</span>
              <span className="text-xl font-semibold text-gray-900">{currencyFormatter.format(cart?.total ?? 0)}</span>
            </div>

            {hasUnavailableItem && (
              <p className="mt-4 text-sm text-red-600">Remove unavailable items before proceeding to checkout.</p>
            )}

            <Link
              href="/checkout"
              aria-disabled={hasUnavailableItem}
              className={`mt-6 block rounded-lg px-5 py-3 text-center text-sm font-medium ${
                hasUnavailableItem
                  ? 'pointer-events-none bg-gray-200 text-gray-400'
                  : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >
              Proceed to checkout
            </Link>

            <Link href="/menu" className="mt-3 block text-center text-sm font-medium text-gray-600 hover:text-gray-900">
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
