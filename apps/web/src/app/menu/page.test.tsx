import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Coffee } from '@caffeinawa/types';

import MenuPage from './page';

const mocks = vi.hoisted(() => ({
  getMenu: vi.fn(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    customer: null,
    isAuthenticated: false,
  }),
}));

vi.mock('@/components/coffee/CoffeeCard', () => ({
  CoffeeCard: ({ coffee }: { coffee: Coffee }) => (
    <article>
      <h3>{coffee.name}</h3>
    </article>
  ),
}));

vi.mock('@/features/store/StoreOrderingNotice', () => ({
  default: () => null,
}));

vi.mock('@/lib/api/menu', () => ({
  getMenu: mocks.getMenu,
}));

const coffees: Coffee[] = [
  {
    id: 'coffee-espresso',
    name: 'House Espresso',
    description: 'A bold coffee with cocoa notes.',
    category: 'espresso',
    price: 120,
    available: true,
  },
  {
    id: 'coffee-latte',
    name: 'Spanish Latte',
    description: 'Milk and caramel sweetness.',
    category: 'latte',
    price: 160,
    available: true,
  },
  {
    id: 'coffee-cold-brew',
    name: 'Cold Brew',
    description: 'Slow-steeped and served chilled.',
    category: 'cold_brew',
    price: 150,
    available: true,
  },
];

async function renderLoadedMenu() {
  const user = userEvent.setup();

  render(<MenuPage />);

  await screen.findByRole('heading', {
    name: 'House Espresso',
  });

  return user;
}

describe('MenuPage browsing', () => {
  beforeEach(() => {
    mocks.getMenu.mockReset();
    mocks.getMenu.mockResolvedValue(coffees);
  });

  it('loads the menu and reports the number of drinks', async () => {
    render(<MenuPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Brewing up the menu...');

    expect(
      await screen.findByRole('heading', {
        name: 'House Espresso',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        name: 'Spanish Latte',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        name: 'Cold Brew',
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole('status')).toHaveTextContent('3 drinks to explore');

    expect(screen.getByRole('button', { name: 'All drinks' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches descriptions without case sensitivity', async () => {
    const user = await renderLoadedMenu();

    await user.type(
      screen.getByRole('searchbox', {
        name: 'Search the menu',
      }),
      'CARAMEL',
    );

    expect(
      screen.getByRole('heading', {
        name: 'Spanish Latte',
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('heading', {
        name: 'House Espresso',
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('heading', {
        name: 'Cold Brew',
      }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('status')).toHaveTextContent('1 drink matching your selection');
  });

  it('filters by category and exposes its selected state', async () => {
    const user = await renderLoadedMenu();

    const latteFilter = screen.getByRole('button', {
      name: 'Latte',
    });

    await user.click(latteFilter);

    expect(latteFilter).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByRole('button', { name: 'All drinks' })).toHaveAttribute('aria-pressed', 'false');

    expect(
      screen.getByRole('heading', {
        name: 'Spanish Latte',
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('heading', {
        name: 'House Espresso',
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole('heading', {
        name: 'Cold Brew',
      }),
    ).not.toBeInTheDocument();
  });

  it('combines search and category filters, then resets both', async () => {
    const user = await renderLoadedMenu();

    const search = screen.getByRole('searchbox', {
      name: 'Search the menu',
    });

    await user.click(screen.getByRole('button', { name: 'Latte' }));

    await user.type(search, 'cold');

    expect(
      screen.getByRole('heading', {
        name: 'No drinks found',
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Show all drinks',
      }),
    );

    expect(search).toHaveValue('');

    expect(screen.getByRole('button', { name: 'All drinks' })).toHaveAttribute('aria-pressed', 'true');

    expect(
      screen.getByRole('heading', {
        name: 'House Espresso',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        name: 'Spanish Latte',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        name: 'Cold Brew',
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('button', {
        name: 'Clear filters',
      }),
    ).not.toBeInTheDocument();
  });

  it('distinguishes an empty menu from unmatched filters', async () => {
    mocks.getMenu.mockResolvedValue([]);

    render(<MenuPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'The menu is taking a little break',
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('heading', {
        name: 'No drinks found',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows a loading error and recovers through retry', async () => {
    mocks.getMenu.mockRejectedValue(new Error('Menu temporarily unavailable'));

    const user = userEvent.setup();

    render(<MenuPage />);

    // The real QueryProvider retries failed queries once.
    expect(await screen.findByRole('alert', {}, { timeout: 5_000 })).toHaveTextContent('Menu temporarily unavailable');

    mocks.getMenu.mockResolvedValue(coffees);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', {
        name: 'House Espresso',
      }),
    ).toBeInTheDocument();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
