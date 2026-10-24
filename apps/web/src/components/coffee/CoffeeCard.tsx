'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';
import { useMenuCart } from '@/hooks/useMenuCart';

import type { Coffee } from '@caffeinawa/types';

interface CoffeeCardProps {
  coffee: Coffee;
}

interface CoffeePhotoProps {
  source?: string;
  name: string;
}

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

function CoffeePhoto({ source, name }: CoffeePhotoProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageSource = source?.trim();

  const isSupportedSource =
    Boolean(imageSource) &&
    (/^https?:\/\//i.test(imageSource ?? '') || (imageSource?.startsWith('/') && !imageSource.startsWith('//')));

  if (!imageSource || !isSupportedSource || failedSource === imageSource) {
    return (
      <div
        aria-hidden="true"
        className="flex h-full min-h-40 flex-col items-center justify-center gap-3 bg-cafe-soft text-cafe-muted"
      >
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-14 w-14">
          <path d="M14 25h29v13a14.5 14.5 0 0 1-29 0V25Z" strokeLinejoin="round" />
          <path d="M43 28h5a7 7 0 0 1 0 14h-6M10 54h39M23 10c-5 5 5 6 0 11M34 8c-5 5 5 7 0 12" strokeLinecap="round" />
        </svg>

        <span className="px-2 text-center text-[10px] uppercase tracking-widest">Photo unavailable</span>
      </div>
    );
  }

  return (
    <Image
      src={imageSource}
      alt={name}
      fill
      unoptimized
      sizes="(max-width: 639px) 112px, (max-width: 1023px) 50vw, 33vw"
      onError={() => setFailedSource(imageSource)}
      className="object-cover"
    />
  );
}

export function CoffeeCard({ coffee }: CoffeeCardProps) {
  const router = useRouter();
  const { customer, accessToken, isAuthenticated } = useAuth();

  const {
    cart,
    isLoading: loadingCart,
    isUpdating: updating,
    error: cartError,
    addCoffee,
    decreaseCoffee,
  } = useMenuCart();

  const quantity = cart?.items.find(item => item.coffeeId === coffee.id)?.quantity ?? 0;

  const error = cartError?.message ?? null;

  async function handleIncrement() {
    if (!isAuthenticated || !customer || !accessToken) {
      router.push('/login?next=%2Fmenu');
      return;
    }

    if (loadingCart || updating || !coffee.available) {
      return;
    }

    try {
      await addCoffee(coffee.id);
    } catch {
      // The mutation error is displayed through useMenuCart.
    }
  }

  async function handleDecrement() {
    if (!isAuthenticated || !customer || !accessToken) {
      router.push('/login?next=%2Fmenu');
      return;
    }

    if (loadingCart || updating || quantity < 1) {
      return;
    }

    try {
      await decreaseCoffee(coffee.id);
    } catch {
      // The mutation error is displayed through useMenuCart.
    }
  }

  return (
    <article className="grid grid-cols-[104px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-cafe-border bg-cafe-paper transition-shadow hover:shadow-md hover:shadow-cafe-espresso/5 sm:flex sm:flex-col">
      <div className="relative min-h-48 overflow-hidden bg-cafe-soft sm:aspect-[16/10] sm:min-h-0">
        <CoffeePhoto source={coffee.imageUrl} name={coffee.name} />

        {!coffee.available && (
          <span className="absolute bottom-3 left-2 right-2 rounded-full bg-cafe-paper/95 px-2 py-1 text-center text-[10px] font-semibold text-cafe-brown sm:left-auto sm:right-3 sm:px-3 sm:text-xs">
            Unavailable
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cafe-accent">
          {coffee.category.replaceAll('_', ' ')}
        </p>

        <h3 className="mt-1 break-words font-display text-xl font-bold leading-tight tracking-[-0.035em] text-cafe-espresso sm:text-2xl">
          {coffee.name}
        </h3>

        <p className="mt-2 flex-1 text-xs leading-5 text-cafe-muted sm:text-sm sm:leading-6">{coffee.description}</p>

        <p className="mb-3 mt-3 text-base font-semibold tabular-nums text-cafe-espresso sm:text-lg">
          {currencyFormatter.format(coffee.price)}
        </p>

        {loadingCart ? (
          <div
            role="status"
            className="flex min-h-11 items-center justify-center rounded-xl bg-cafe-soft px-2 text-xs text-cafe-muted"
          >
            Loading your cart...
          </div>
        ) : !coffee.available ? (
          <div className="flex min-h-11 items-center justify-center rounded-xl bg-cafe-soft px-2 text-xs font-medium text-cafe-muted">
            Currently unavailable
          </div>
        ) : quantity > 0 ? (
          <div
            role="group"
            aria-label={`Quantity for ${coffee.name}`}
            aria-busy={updating}
            className="flex items-center justify-between rounded-full border border-cafe-border bg-cafe-cream"
          >
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={updating}
              onClick={() => void handleDecrement()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-cafe-espresso hover:bg-cafe-soft disabled:opacity-40"
            >
              <span aria-hidden="true">−</span>
            </button>

            <span
              aria-live="polite"
              className="min-w-6 text-center text-sm font-semibold tabular-nums text-cafe-espresso"
            >
              {updating ? '…' : quantity}
            </span>

            <button
              type="button"
              aria-label="Increase quantity"
              disabled={updating}
              onClick={() => void handleIncrement()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-cafe-espresso hover:bg-cafe-soft disabled:opacity-40"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={updating}
            onClick={() => void handleIncrement()}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-cafe-espresso px-3 text-sm font-medium text-white transition-colors hover:bg-cafe-brown disabled:opacity-50"
          >
            {updating ? 'Adding...' : isAuthenticated ? 'Add to cart' : 'Sign In'}
          </button>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
