import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Coffee } from '@caffeinawa/types';

import MenuPage from './page';

const mocks = vi.hoisted(() => ({
  getMenu: vi.fn(),
  getOrdering: vi.fn(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    customer: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

vi.mock('@/components/coffee/CoffeeCard', () => ({
  CoffeeCard: ({ coffee }: { coffee: Coffee }) => (
    <article>
      <h3>{coffee.name}</h3>
    </article>
  ),
}));

vi.mock('@/lib/api/menu', () => ({
  getMenu: mocks.getMenu,
}));

vi.mock('@/features/store/store.api', () => ({
  getStoreOrdering: mocks.getOrdering,
}));

const coffees: Coffee[] = [
  {
    id: 'coffee-1',
    name: 'House Espresso',
    description: 'Bold espresso.',
    category: 'espresso',
    price: 120,
    available: true,
  },
  {
    id: 'coffee-2',
    name: 'Spanish Latte',
    description: 'Smooth and sweet.',
    category: 'latte',
    price: 160,
    available: true,
  },
];

beforeEach(() => {
  mocks.getMenu.mockReset();
  mocks.getOrdering.mockReset();

  mocks.getMenu.mockResolvedValue(coffees);
  mocks.getOrdering.mockResolvedValue({
    acceptingOrders: false,
    updatedAt: null,
    paymentMethods: ['cash'],
  });
});

describe('Menu ordering notice', () => {
  it('keeps browsing and category filters available while ordering is closed', async () => {
    const user = userEvent.setup();

    render(<MenuPage />);

    expect(await screen.findByText(/Ordering is currently closed/)).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'House Espresso' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Latte' }));

    expect(screen.getByRole('heading', { name: 'Spanish Latte' })).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'House Espresso' })).not.toBeInTheDocument();

    expect(screen.getByText(/Ordering is currently closed/)).toBeInTheDocument();
  });

  it('keeps the menu searchable when availability cannot be loaded', async () => {
    mocks.getOrdering.mockRejectedValue(new Error('Service unavailable'));

    const user = userEvent.setup();

    render(<MenuPage />);

    expect(await screen.findByRole('alert', {}, { timeout: 5_000 })).toHaveTextContent(
      "We couldn't check whether ordering is open.",
    );

    await screen.findByRole('heading', { name: 'House Espresso' });

    await user.type(screen.getByRole('searchbox', { name: 'Search the menu' }), 'Spanish');

    expect(screen.getByRole('heading', { name: 'Spanish Latte' })).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'House Espresso' })).not.toBeInTheDocument();
  });
});
