import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CART_CHANGED_KEY } from '@/lib/cart-events';
import MenuCartSync from './MenuCartSync';

import type { Cart } from '@caffeinawa/types';

const mocks = vi.hoisted(() => ({
  loadCart: vi.fn(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    customer: {
      id: 'customer-1',
    },
    isAuthenticated: true,
  }),
}));

function makeCart(total: number): Cart {
  return {
    id: 'cart-1',
    customerId: 'customer-1',
    items: [],
    total,
  };
}

function CartProbe() {
  const query = useQuery({
    queryKey: ['menu-cart', 'customer-1'],
    queryFn: (): Promise<Cart> => mocks.loadCart(),
    staleTime: Infinity,
  });

  return <p role="status">{query.data ? `Cart total: ${query.data.total}` : 'Loading cart...'}</p>;
}

function renderCart() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MenuCartSync />
      <CartProbe />
    </QueryClientProvider>,
  );
}

function dispatchCartEvent(value: string) {
  window.localStorage.setItem(CART_CHANGED_KEY, value);

  window.dispatchEvent(
    new StorageEvent('storage', {
      key: CART_CHANGED_KEY,
      newValue: value,
      storageArea: window.localStorage,
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.loadCart.mockReset();
});

describe('MenuCartSync', () => {
  it('refreshes the active customer cart after another tab changes it', async () => {
    mocks.loadCart.mockResolvedValueOnce(makeCart(150)).mockResolvedValueOnce(makeCart(300));

    renderCart();

    await screen.findByText('Cart total: 150');

    act(() => {
      dispatchCartEvent(
        JSON.stringify({
          customerId: 'customer-1',
          eventId: 'event-1',
        }),
      );
    });

    expect(await screen.findByText('Cart total: 300')).toBeInTheDocument();

    expect(mocks.loadCart).toHaveBeenCalledTimes(2);
  });

  it.each([
    'not-json',
    JSON.stringify({}),
    JSON.stringify({
      customerId: 'another-customer',
      eventId: 'event-2',
    }),
  ])('ignores unrelated or invalid notifications: %s', async value => {
    mocks.loadCart.mockResolvedValue(makeCart(150));

    renderCart();

    await screen.findByText('Cart total: 150');

    act(() => {
      dispatchCartEvent(value);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Cart total: 150');

    expect(mocks.loadCart).toHaveBeenCalledTimes(1);
  });
});
