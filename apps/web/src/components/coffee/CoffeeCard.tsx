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
    <article className="flex h-full flex-col rounded-3xl border border-[#e7dfd5] bg-white p-6 transition duration-200 hover:border-[#cdbba8] hover:shadow-lg hover:shadow-[#38271f]/5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#f3ece3] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7e5b3f]">
          {coffee.category.replaceAll('_', ' ')}
        </span>

        {!coffee.available && <span className="text-xs font-medium text-[#75685e]">Currently unavailable</span>}
      </div>

      <div className="mt-7 flex-1">
        <h3 className="font-serif text-3xl leading-tight tracking-tight text-[#30251f]">{coffee.name}</h3>

        <p className="mt-3 text-sm leading-7 text-[#75685e]">{coffee.description}</p>
      </div>

      <div className="mt-7 border-t border-[#eee7df] pt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94877c]">Per drink</p>

            <p className="mt-1 text-2xl font-semibold tracking-tight text-[#30251f]">
              {currencyFormatter.format(coffee.price)}
            </p>
          </div>

          {quantity > 0 && !loadingCart && <span className="text-xs text-[#75685e]">In your cart</span>}
        </div>

        <div className="mt-5">
          {loadingCart ? (
            <div
              role="status"
              className="flex min-h-12 items-center justify-center rounded-2xl bg-[#f6f1eb] text-sm text-[#75685e]"
            >
              Loading your cart...
            </div>
          ) : !coffee.available ? (
            <div className="flex min-h-12 items-center justify-center rounded-2xl bg-[#f3efea] text-sm font-medium text-[#84786d]">
              Currently unavailable
            </div>
          ) : quantity > 0 ? (
            <div
              role="group"
              aria-label={`Quantity for ${coffee.name}`}
              aria-busy={updating}
              className="flex min-h-12 items-center justify-between rounded-2xl border border-[#ded4c8] bg-[#faf7f2] p-1"
            >
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={updating}
                onClick={() => void handleDecrement()}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl text-[#38271f] transition hover:bg-[#ece2d6] focus-visible:outline-2 focus-visible:outline-[#886345] disabled:opacity-40"
              >
                <span aria-hidden="true">−</span>
              </button>

              <span
                aria-live="polite"
                className="min-w-8 text-center text-base font-semibold tabular-nums text-[#30251f]"
              >
                {updating ? '…' : quantity}
              </span>

              <button
                type="button"
                aria-label="Increase quantity"
                disabled={updating}
                onClick={() => void handleIncrement()}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl text-[#38271f] transition hover:bg-[#ece2d6] focus-visible:outline-2 focus-visible:outline-[#886345] disabled:opacity-40"
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={updating}
              onClick={() => void handleIncrement()}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-[#38271f] px-4 text-sm font-semibold text-white transition hover:bg-[#543a2d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#886345] disabled:opacity-50"
            >
              {updating ? 'Adding...' : isAuthenticated ? 'Add to cart' : 'Sign In'}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
