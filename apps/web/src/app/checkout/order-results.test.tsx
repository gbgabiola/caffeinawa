import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CheckoutCancelledPage from './cancelled/page';
import CheckoutSuccessPage from './success/page';

const mocks = vi.hoisted(() => ({
  query: 'orderId=order-1',
  useAuth: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/lib/api/orders', () => ({
  getOrder: mocks.getOrder,
}));

beforeEach(() => {
  mocks.query = 'orderId=order-1';
  mocks.getOrder.mockReset();

  mocks.useAuth.mockReturnValue({
    customer: { id: 'customer-1' },
    accessToken: 'customer-token',
    isAuthenticated: true,
    isLoading: false,
  });
});

describe('Checkout order results', () => {
  it('reports a confirmed order without claiming payment was confirmed', async () => {
    mocks.getOrder.mockResolvedValue({
      id: 'order-1',
      status: 'confirmed',
      total: 300,
    });

    render(<CheckoutSuccessPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Your order is confirmed.',
      }),
    ).toBeInTheDocument();

    expect(mocks.getOrder).toHaveBeenCalledExactlyOnceWith('customer-token', 'order-1');

    expect(screen.queryByText('Payment confirmed')).not.toBeInTheDocument();
  });

  it('displays cancellation only when returned by the order API', async () => {
    mocks.getOrder.mockResolvedValue({
      id: 'order-1',
      status: 'cancelled',
      total: 300,
    });

    render(<CheckoutSuccessPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'This order was cancelled.',
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/does not confirm a refund/i)).toBeInTheDocument();
  });

  it('requires an order reference before requesting order data', () => {
    mocks.query = '';

    render(<CheckoutSuccessPage />);

    expect(
      screen.getByRole('heading', {
        name: 'Order reference missing',
      }),
    ).toBeInTheDocument();

    expect(mocks.getOrder).not.toHaveBeenCalled();
  });

  it('does not request private order details when signed out', () => {
    mocks.useAuth.mockReturnValue({
      customer: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });

    render(<CheckoutSuccessPage />);

    expect(
      screen.getByRole('heading', {
        name: 'Sign in to check your order',
      }),
    ).toBeInTheDocument();

    expect(mocks.getOrder).not.toHaveBeenCalled();
  });

  it('shows order lookup errors', async () => {
    mocks.getOrder.mockRejectedValue(new Error('Unable to load order.'));

    render(<CheckoutSuccessPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load order.');

    expect(
      screen.getByRole('button', {
        name: 'Refresh order status',
      }),
    ).toBeEnabled();
  });

  it('links cancellation returns to the encoded order-status URL', () => {
    mocks.query = 'orderId=order%2F1%3Fx%3D2';

    render(<CheckoutCancelledPage />);

    expect(
      screen.getByRole('link', {
        name: 'Check order status',
      }),
    ).toHaveAttribute('href', '/checkout/success?orderId=order%2F1%3Fx%3D2');

    expect(
      screen.queryByRole('heading', {
        name: 'This order was cancelled.',
      }),
    ).not.toBeInTheDocument();

    expect(mocks.getOrder).not.toHaveBeenCalled();
  });
});
