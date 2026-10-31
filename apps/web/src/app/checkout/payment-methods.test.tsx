import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Cart, PaymentProvider, StoreOrderingStatus } from '@caffeinawa/types';

import CheckoutPage from './page';

const mocks = vi.hoisted(() => ({
  getCart: vi.fn(),
  checkoutCart: vi.fn(),
  useOrdering: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    customer: { id: 'customer-1' },
    accessToken: 'customer-token',
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useStoreOrdering', () => ({
  useStoreOrdering: mocks.useOrdering,
}));

vi.mock('@/features/store/StoreOrderingNotice', () => ({
  default: () => null,
}));

vi.mock('@/lib/cart-events', () => ({
  notifyCartChanged: vi.fn(),
}));

vi.mock('@/lib/api/cart', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/cart')>();

  return {
    ...actual,
    getCart: mocks.getCart,
    checkoutCart: mocks.checkoutCart,
  };
});

const cart: Cart = {
  id: 'cart-1',
  customerId: 'customer-1',
  items: [
    {
      id: 'item-1',
      coffeeId: 'coffee-1',
      coffee: {
        id: 'coffee-1',
        name: 'Test Latte',
        price: 150,
        available: true,
      },
      quantity: 1,
      subtotal: 150,
    },
  ],
  total: 150,
};

function setMethods(paymentMethods: PaymentProvider[]) {
  const data: StoreOrderingStatus = {
    acceptingOrders: true,
    updatedAt: null,
    paymentMethods,
  };

  mocks.useOrdering.mockReturnValue({
    data,
    isPending: false,
    isError: false,
  });
}

beforeEach(() => {
  mocks.getCart.mockReset().mockResolvedValue(cart);
  mocks.checkoutCart.mockReset().mockResolvedValue({ id: 'order-1' });
  mocks.replace.mockReset();
  mocks.useOrdering.mockReset();

  setMethods(['cash']);
});

describe('Checkout payment capabilities', () => {
  it('offers only cash when PayMongo is disabled', async () => {
    render(<CheckoutPage />);

    expect(await screen.findByRole('radio', { name: /^Cash/ })).toBeChecked();

    expect(screen.queryByRole('radio', { name: /^PayMongo/ })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Place cash order' })).toBeEnabled();
  });

  it('offers PayMongo when enabled', async () => {
    setMethods(['cash', 'paymongo']);

    const user = userEvent.setup();

    render(<CheckoutPage />);

    await user.click(await screen.findByRole('radio', { name: /^PayMongo/ }));

    expect(screen.getByRole('button', { name: 'Continue to PayMongo' })).toBeEnabled();
  });

  it('falls back to cash when selected PayMongo becomes disabled', async () => {
    setMethods(['cash', 'paymongo']);

    const user = userEvent.setup();
    const { rerender } = render(<CheckoutPage />);

    await user.click(await screen.findByRole('radio', { name: /^PayMongo/ }));

    setMethods(['cash']);
    rerender(<CheckoutPage />);

    expect(screen.queryByRole('radio', { name: /^PayMongo/ })).not.toBeInTheDocument();

    expect(screen.getByRole('radio', { name: /^Cash/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Place cash order' }));

    await waitFor(() => {
      expect(mocks.checkoutCart).toHaveBeenCalledExactlyOnceWith('customer-token', 'customer-1', 'cash');
    });
  });

  it('blocks checkout when no payment methods are available', async () => {
    setMethods([]);

    render(<CheckoutPage />);

    expect(
      await screen.findByRole('button', {
        name: 'No payment methods available',
      }),
    ).toBeDisabled();

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(mocks.checkoutCart).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'Checking availability...',
      isPending: true,
      isError: false,
    },
    {
      name: 'Ordering availability unavailable',
      isPending: false,
      isError: true,
    },
  ])('blocks checkout during $name', async ({ name, isPending, isError }) => {
    mocks.useOrdering.mockReturnValue({
      data: undefined,
      isPending,
      isError,
    });

    render(<CheckoutPage />);

    expect(await screen.findByRole('button', { name })).toBeDisabled();

    expect(mocks.checkoutCart).not.toHaveBeenCalled();
  });
});
