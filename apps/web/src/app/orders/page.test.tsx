import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Order } from '@caffeinawa/types';

import OrdersPage from './page';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getOrders: vi.fn(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/lib/api/orders', () => ({
  getOrders: mocks.getOrders,
}));

const order: Order = {
  id: 'order/1',
  customerId: 'customer-1',
  status: 'confirmed',
  total: 300,
  createdAt: '2026-11-01T02:00:00.000Z',
  items: [
    {
      coffeeId: 'coffee-1',
      quantity: 2,
      unitPrice: 150,
    },
  ],
};

beforeEach(() => {
  mocks.getOrders.mockReset().mockResolvedValue([order]);

  mocks.useAuth.mockReturnValue({
    customer: { id: 'customer-1' },
    accessToken: 'customer-token',
    isAuthenticated: true,
    isLoading: false,
  });
});

describe('OrdersPage', () => {
  it('requires sign-in without requesting private orders', () => {
    mocks.useAuth.mockReturnValue({
      customer: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });

    render(<OrdersPage />);

    expect(
      screen.getByRole('heading', {
        name: 'Sign in to view your orders',
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Forders');

    expect(mocks.getOrders).not.toHaveBeenCalled();
  });

  it('waits for authentication before requesting orders', () => {
    mocks.useAuth.mockReturnValue({
      customer: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
    });

    render(<OrdersPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session...');

    expect(mocks.getOrders).not.toHaveBeenCalled();
  });

  it('loads orders and links to their encoded references', async () => {
    render(<OrdersPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading your orders...');

    expect(
      await screen.findByRole('link', {
        name: 'View order order/1',
      }),
    ).toHaveAttribute('href', '/checkout/success?orderId=order%2F1');

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('2 drinks')).toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();

    expect(mocks.getOrders).toHaveBeenCalledExactlyOnceWith('customer-token');
  });

  it('shows an empty history', async () => {
    mocks.getOrders.mockResolvedValue([]);

    render(<OrdersPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Your first order awaits.',
      }),
    ).toBeInTheDocument();
  });

  it('recovers from a loading error through retry', async () => {
    mocks.getOrders.mockRejectedValueOnce(new Error('Unable to load your orders.')).mockResolvedValueOnce([order]);

    const user = userEvent.setup();

    render(<OrdersPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your orders.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('link', {
        name: 'View order order/1',
      }),
    ).toBeInTheDocument();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes the displayed order status', async () => {
    const user = userEvent.setup();

    render(<OrdersPage />);

    await screen.findByText('Confirmed');

    mocks.getOrders.mockResolvedValue([{ ...order, status: 'ready' }]);

    await user.click(screen.getByRole('button', { name: 'Refresh orders' }));

    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed')).not.toBeInTheDocument();
  });

  it('hides loaded orders immediately when the customer signs out', async () => {
    const { rerender } = render(<OrdersPage />);

    await screen.findByRole('link', {
      name: 'View order order/1',
    });

    mocks.useAuth.mockReturnValue({
      customer: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });

    rerender(<OrdersPage />);

    expect(
      screen.queryByRole('link', {
        name: 'View order order/1',
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        name: 'Sign in to view your orders',
      }),
    ).toBeInTheDocument();
  });
});
