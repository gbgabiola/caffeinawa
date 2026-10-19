'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';
import { addCartItem, getCart, removeCartItem, updateCartItem } from '@/lib/api/cart';

import type { Coffee } from '@caffeinawa/types';

interface CoffeeCardProps {
  coffee: Coffee;
}

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

export function CoffeeCard({ coffee }: CoffeeCardProps) {
  const router = useRouter();
  const { customer, accessToken, isAuthenticated } = useAuth();

  const [quantity, setQuantity] = useState(0);
  const [loadingCart, setLoadingCart] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        const cart = await getCart(currentAccessToken, currentCustomer.id);
        if (cancelled) {
          return;
        }
        const cartItem = cart.items.find(item => item.coffeeId === coffee.id);
        setQuantity(cartItem?.quantity ?? 0);
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
  }, [accessToken, coffee.id, customer, isAuthenticated]);

  async function handleIncrement() {
    if (!isAuthenticated || !customer || !accessToken) {
      router.push('/login');
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const cart = await addCartItem(accessToken, customer.id, coffee.id);
      const cartItem = cart.items.find(item => item.coffeeId === coffee.id);
      setQuantity(cartItem?.quantity ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add item.');
    } finally {
      setUpdating(false);
    }
  }

  async function handleDecrement() {
    if (!isAuthenticated || !customer || !accessToken) {
      router.push('/login');
      return;
    }

    if (updating || loadingCart || quantity < 1) {
      return;
    }

    setUpdating(true);
    setError(null);

    try {
      const currentCart = await getCart(accessToken, customer.id);

      const currentItem = currentCart.items.find(item => item.coffeeId === coffee.id);

      if (!currentItem) {
        setQuantity(0);
        return;
      }

      const updatedCart =
        currentItem.quantity === 1
          ? await removeCartItem(accessToken, customer.id, currentItem.id)
          : await updateCartItem(accessToken, customer.id, currentItem.id, currentItem.quantity - 1);

      const updatedItem = updatedCart.items.find(item => item.coffeeId === coffee.id);

      setQuantity(updatedItem?.quantity ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reduce item count.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <article
      className={`relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-gray-300/80 ${
        !coffee.available ? 'border-l-4 border-l-amber-200 border-gray-200 bg-gray-50/40' : 'border-gray-100'
      }`}
    >
      {/* LEFT COLUMN: Product Content Info */}
      <div className="flex-1 space-y-2">
        <div className="space-y-0.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700/80">
            {coffee.category.replace('_', ' ')}
          </span>
          <h2 className={`text-xl font-bold tracking-tight text-gray-900 ${!coffee.available && 'text-gray-600'}`}>
            {coffee.name}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-gray-500 max-w-xl line-clamp-2">{coffee.description}</p>

        {error && (
          <p
            role="alert"
            className="inline-block text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-md border border-red-100/60 mt-1"
          >
            {error}
          </p>
        )}
      </div>

      {/* RIGHT COLUMN: Price and Menu Stepper Controls */}
      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-4 sm:min-w-[140px] pt-4 sm:pt-0 border-t sm:border-t-0 border-gray-100">
        <div className="text-left sm:text-right">
          <span className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Price</span>
          <span
            className={`text-lg font-semibold tracking-tight text-gray-950 ${!coffee.available && 'text-gray-400 font-medium'}`}
          >
            {currencyFormatter.format(coffee.price)}
          </span>
        </div>

        <div className="w-36 h-11 flex items-center justify-end">
          {loadingCart ? (
            <div className="flex items-center justify-center w-full h-full text-xs font-medium text-gray-400 bg-gray-50 rounded-xl border border-gray-100 animate-pulse">
              Loading...
            </div>
          ) : !coffee.available ? (
            <div className="w-full h-full flex items-center justify-center rounded-xl bg-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-400 border border-gray-200/50 select-none">
              Unavailable
            </div>
          ) : quantity > 0 ? (
            /* Interlocking Stepper Component */
            <div className="flex w-full h-full items-center justify-between rounded-xl border border-gray-900 bg-gray-950 p-1 shadow-sm transition-all duration-200">
              <button
                type="button"
                onClick={() => void handleDecrement()}
                disabled={updating}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>

              <span className="text-sm font-bold text-white min-w-[24px] text-center tracking-tight">
                {updating ? '···' : quantity}
              </span>

              <button
                type="button"
                onClick={() => void handleIncrement()}
                disabled={updating}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
                aria-label="Increase quantity"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleIncrement()}
              disabled={updating}
              className="w-full h-full rounded-xl bg-gray-900 text-sm font-semibold text-white shadow-sm hover:bg-amber-950 transition-all duration-200 active:scale-[0.98]"
            >
              {updating ? 'Adding...' : isAuthenticated ? 'Add to cart' : 'Sign In'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
