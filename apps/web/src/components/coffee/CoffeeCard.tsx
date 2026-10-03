'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Coffee } from '@caffeinawa/types';

import { useAuth } from '@/components/auth/AuthProvider';
import { addCartItem, getCart } from '@/lib/api/cart';

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
  const [adding, setAdding] = useState(false);
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

  async function handleAddToCart() {
    if (!isAuthenticated || !customer || !accessToken) {
      router.push('/login');
      return;
    }

    setAdding(true);
    setError(null);

    try {
      const cart = await addCartItem(accessToken, customer.id, coffee.id);
      const cartItem = cart.items.find(item => item.coffeeId === coffee.id);

      setQuantity(cartItem?.quantity ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add this coffee to your cart.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{coffee.name}</h2>

            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              {coffee.category.replace('_', ' ')}
            </p>
          </div>

          <p className="font-semibold text-gray-900">{currencyFormatter.format(coffee.price)}</p>
        </div>

        <p className="mt-4 text-sm leading-6 text-gray-600">{coffee.description}</p>
      </div>

      <div className="mt-6">
        {!coffee.available && <p className="mb-3 text-sm font-medium text-red-600">Currently unavailable</p>}

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {quantity > 0 && coffee.available && (
          <p className="mb-3 text-center text-sm font-medium text-gray-700">
            {quantity} {quantity === 1 ? 'item' : 'items'} in cart
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleAddToCart()}
          disabled={adding || loadingCart || !coffee.available}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loadingCart
            ? 'Loading cart...'
            : adding
              ? 'Adding...'
              : coffee.available
                ? quantity > 0
                  ? `Added to cart (${quantity})`
                  : isAuthenticated
                    ? 'Add to cart'
                    : 'Sign in to order'
                : 'Unavailable'}
        </button>
      </div>
    </article>
  );
}
