import type { ComponentProps } from 'react';
import { IDBFactory } from 'fake-indexeddb';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Cart, PaymentProvider, StoreOrderingStatus } from '@caffeinawa/types';

import CheckoutPage from './page';
import { getOrCreateCheckoutIntent, readCheckoutIntent, markCheckoutResolved } from '@/lib/checkout-intents';
import { PaymentCheckoutUnavailableError } from '@/lib/api/cart';

const mocks = vi.hoisted(() => ({
  getCart: vi.fn(),
  checkoutCart: vi.fn(),
  recoverCheckout: vi.fn(),
  useOrdering: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
    recoverCheckout: mocks.recoverCheckout,
  };
});

const cart: Cart = {
  revision: 0,
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
  vi.stubGlobal('indexedDB', new IDBFactory());
  mocks.getCart.mockReset().mockResolvedValue(cart);
  mocks.checkoutCart.mockReset().mockResolvedValue({ id: 'order-1' });
  mocks.recoverCheckout.mockReset().mockResolvedValue({ checkoutNotCreated: true });
  mocks.replace.mockReset();
  mocks.useOrdering.mockReset();

  setMethods(['cash']);
});

async function submit() {
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Place cash order' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Place cash order' }));
}

describe('Checkout recovery', () => {
  it('saves progress before sending checkout, and resolves it before navigating', async () => {
    mocks.checkoutCart.mockImplementation(async (_token, customerId, input) => {
      expect(await readCheckoutIntent(customerId)).toMatchObject(input);
      return { id: 'order-1' };
    });
    render(<CheckoutPage />);
    await submit();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/checkout/success?orderId=order-1'));
    expect(await readCheckoutIntent('customer-1')).toMatchObject({ resolvedOrderId: 'order-1' });
  });

  it('recovers a committed order after a lost response without another checkout', async () => {
    mocks.checkoutCart.mockRejectedValue(new TypeError('Failed to fetch'));
    mocks.recoverCheckout.mockResolvedValue({
      checkoutReplayed: true,
      paymentProvider: 'cash',
      order: { id: 'original' },
    });
    render(<CheckoutPage />);
    await submit();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/checkout/success?orderId=original'));
    expect(mocks.checkoutCart).toHaveBeenCalledTimes(1);
    expect(mocks.recoverCheckout.mock.calls[0]![2]).toEqual(mocks.checkoutCart.mock.calls[0]![2]);
  });

  it('closes an uncommitted request before allowing a fresh checkout', async () => {
    mocks.checkoutCart.mockRejectedValue(new Error('Your cart changed.'));
    render(<CheckoutPage />);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your cart changed.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Place cash order' })).toBeEnabled());
    expect(await readCheckoutIntent('customer-1')).toBeNull();
    expect(mocks.checkoutCart).toHaveBeenCalledTimes(1);
    expect(mocks.getCart).toHaveBeenCalledTimes(2);
  });

  it('retains an ambiguous request across reloads and permits recovery with a closed store and empty cart', async () => {
    mocks.checkoutCart.mockRejectedValue(new TypeError('offline'));
    mocks.recoverCheckout.mockRejectedValue(new TypeError('offline'));
    const view = render(<CheckoutPage />);
    await submit();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check previous checkout' })).toBeEnabled(),
    );
    let saved: Awaited<ReturnType<typeof readCheckoutIntent>> = null;
    await act(async () => {
      saved = await readCheckoutIntent('customer-1');
    });
    expect(saved).not.toBeNull();
    view.unmount();
    mocks.getCart.mockResolvedValue({ ...cart, revision: 2, items: [], total: 0 });
    mocks.useOrdering.mockReturnValue({
      data: { acceptingOrders: false, paymentMethods: ['cash'] },
      isPending: false,
      isError: false,
    });
    mocks.recoverCheckout.mockResolvedValue({
      checkoutReplayed: true,
      paymentProvider: 'cash',
      order: { id: 'recovered' },
    });
    render(<CheckoutPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Check previous checkout' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/checkout/success?orderId=recovered'));
    expect(mocks.checkoutCart).toHaveBeenCalledTimes(1);
    expect(mocks.recoverCheckout.mock.calls.at(-1)![2]).toMatchObject({
      idempotencyKey: (saved as unknown as { idempotencyKey: string }).idempotencyKey,
      cartRevision: 0,
    });
  });

  it('recovers an intent created in another tab instead of checking out a refilled cart', async () => {
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Place cash order' })).toBeEnabled());
    const saved = await getOrCreateCheckoutIntent('customer-1', 'paymongo', 7);
    mocks.recoverCheckout.mockResolvedValue({
      checkoutReplayed: true,
      paymentProvider: 'paymongo',
      order: { id: 'previous' },
    });
    await submit();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        '/checkout/success?orderId=previous&paymentCheckout=unavailable',
      ),
    );
    expect(mocks.checkoutCart).not.toHaveBeenCalled();
    expect(mocks.recoverCheckout.mock.calls[0]![2]).toMatchObject({
      idempotencyKey: saved.intent.idempotencyKey,
      cartRevision: 7,
      paymentProvider: 'paymongo',
    });
  });

  it('uses a resolved order reference after a reload without a new API checkout', async () => {
    const { intent } = await getOrCreateCheckoutIntent('customer-1', 'cash', 0);
    await markCheckoutResolved(intent, 'known-order');
    render(<CheckoutPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Check previous checkout' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/checkout/success?orderId=known-order'));
    expect(mocks.checkoutCart).not.toHaveBeenCalled();
    expect(mocks.recoverCheckout).not.toHaveBeenCalled();
  });

  it('preserves the order reference from a payment checkout failure', async () => {
    mocks.checkoutCart.mockRejectedValue(new PaymentCheckoutUnavailableError('created-order'));
    render(<CheckoutPage />);
    await submit();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        '/checkout/success?orderId=created-order&paymentCheckout=unavailable',
      ),
    );
    expect(mocks.recoverCheckout).not.toHaveBeenCalled();
    expect(await readCheckoutIntent('customer-1')).toMatchObject({ resolvedOrderId: 'created-order' });
  });

  it('does not send checkout when saving progress fails after the initial storage read', async () => {
    render(<CheckoutPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Place cash order' })).toBeEnabled());
    vi.stubGlobal('indexedDB', undefined);
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow site storage');
    expect(mocks.checkoutCart).not.toHaveBeenCalled();
    expect(mocks.recoverCheckout).not.toHaveBeenCalled();
  });

  it('blocks checkout if progress cannot be stored', async () => {
    vi.stubGlobal('indexedDB', undefined);
    render(<CheckoutPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow site storage');
    expect(screen.getByRole('button', { name: 'Place cash order' })).toBeDisabled();
    expect(mocks.checkoutCart).not.toHaveBeenCalled();
  });
});
