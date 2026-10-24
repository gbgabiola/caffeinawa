import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CoffeeCard } from './CoffeeCard';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Cart, Coffee } from '@caffeinawa/types';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getCart: vi.fn(),
  addCartItem: vi.fn(),
  updateCartItem: vi.fn(),
  removeCartItem: vi.fn(),
  auth: {
    customer: {
      id: 'customer-1',
      name: 'Test Customer',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    },
    accessToken: 'customer-token',
    isAuthenticated: true,
    isLoading: false,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/lib/api/cart', () => ({
  getCart: mocks.getCart,
  addCartItem: mocks.addCartItem,
  updateCartItem: mocks.updateCartItem,
  removeCartItem: mocks.removeCartItem,
}));

const coffee: Coffee = {
  id: 'coffee-1',
  name: 'Test Latte',
  description: 'Coffee for cart tests.',
  category: 'latte',
  price: 150,
  available: true,
};

function makeCart(quantity: number): Cart {
  return {
    id: 'cart-1',
    customerId: 'customer-1',
    items:
      quantity > 0
        ? [
            {
              id: 'cart-item-1',
              coffeeId: coffee.id,
              coffee: {
                id: coffee.id,
                name: coffee.name,
                price: coffee.price,
                available: coffee.available,
              },
              quantity,
              subtotal: coffee.price * quantity,
            },
          ]
        : [],
    total: coffee.price * quantity,
  };
}

function renderWithCart(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return {
    user: userEvent.setup(),
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

async function renderLoadedCard(quantity: number) {
  mocks.getCart.mockResolvedValue(makeCart(quantity));

  const { user } = renderWithCart(<CoffeeCard coffee={coffee} />);

  await screen.findByRole('button', {
    name: 'Decrease quantity',
  });

  expect(screen.getByText(String(quantity))).toBeInTheDocument();

  return user;
}

describe('CoffeeCard decrement', () => {
  beforeEach(() => {
    mocks.getCart.mockReset();
    mocks.addCartItem.mockReset();
    mocks.updateCartItem.mockReset();
    mocks.removeCartItem.mockReset();
    mocks.push.mockReset();
  });

  it('updates the cart item using its ID and displays the server quantity', async () => {
    mocks.updateCartItem.mockResolvedValueOnce(makeCart(1));

    const user = await renderLoadedCard(2);

    await user.click(
      screen.getByRole('button', {
        name: 'Decrease quantity',
      }),
    );

    await waitFor(() => {
      expect(mocks.updateCartItem).toHaveBeenCalledExactlyOnceWith('customer-token', 'customer-1', 'cart-item-1', 1);

      expect(screen.getByText('1')).toBeInTheDocument();
    });

    expect(mocks.removeCartItem).not.toHaveBeenCalled();
    expect(mocks.addCartItem).not.toHaveBeenCalled();
  });

  it('removes the last item instead of PATCHing quantity zero', async () => {
    mocks.removeCartItem.mockResolvedValueOnce(makeCart(0));

    const user = await renderLoadedCard(1);

    await user.click(
      screen.getByRole('button', {
        name: 'Decrease quantity',
      }),
    );

    expect(
      await screen.findByRole('button', {
        name: 'Add to cart',
      }),
    ).toBeInTheDocument();

    expect(mocks.removeCartItem).toHaveBeenCalledExactlyOnceWith('customer-token', 'customer-1', 'cart-item-1');

    expect(mocks.updateCartItem).not.toHaveBeenCalled();
  });

  it('keeps the quantity unchanged when the update fails', async () => {
    mocks.updateCartItem.mockRejectedValueOnce(new Error('Unable to update cart'));

    const user = await renderLoadedCard(2);

    await user.click(
      screen.getByRole('button', {
        name: 'Decrease quantity',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to update cart');

    expect(screen.getByText('2')).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: 'Decrease quantity',
      }),
    ).toBeEnabled();
  });

  it('clears the displayed quantity when the item was already removed', async () => {
    const user = await renderLoadedCard(2);

    mocks.getCart.mockResolvedValueOnce(makeCart(0));

    await user.click(
      screen.getByRole('button', {
        name: 'Decrease quantity',
      }),
    );

    expect(
      await screen.findByRole('button', {
        name: 'Add to cart',
      }),
    ).toBeInTheDocument();

    expect(mocks.updateCartItem).not.toHaveBeenCalled();
    expect(mocks.removeCartItem).not.toHaveBeenCalled();
  });

  it('decrements the latest server quantity rather than stale local state', async () => {
    mocks.updateCartItem.mockResolvedValueOnce(makeCart(3));

    const user = await renderLoadedCard(2);

    mocks.getCart.mockResolvedValueOnce(makeCart(4));

    await user.click(
      screen.getByRole('button', {
        name: 'Decrease quantity',
      }),
    );

    await waitFor(() => {
      expect(mocks.updateCartItem).toHaveBeenCalledExactlyOnceWith('customer-token', 'customer-1', 'cart-item-1', 3);

      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
});

describe('CoffeeCard shared cart', () => {
  beforeEach(() => {
    mocks.getCart.mockReset();
    mocks.addCartItem.mockReset();
    mocks.updateCartItem.mockReset();
    mocks.removeCartItem.mockReset();
    mocks.push.mockReset();
  });

  it('loads one cart for multiple menu cards', async () => {
    mocks.getCart.mockResolvedValue(makeCart(2));

    const otherCoffee: Coffee = {
      ...coffee,
      id: 'coffee-2',
      name: 'Cold Brew',
      category: 'cold_brew',
    };

    renderWithCart(
      <>
        <CoffeeCard coffee={coffee} />
        <CoffeeCard coffee={otherCoffee} />
      </>,
    );

    await screen.findByRole('button', {
      name: 'Decrease quantity',
    });

    await screen.findByRole('button', {
      name: 'Add to cart',
    });

    expect(mocks.getCart).toHaveBeenCalledExactlyOnceWith('customer-token', 'customer-1');
  });

  it('updates every view of a coffee from the returned cart', async () => {
    mocks.getCart.mockResolvedValue(makeCart(2));
    mocks.updateCartItem.mockResolvedValue(makeCart(1));

    const { user } = renderWithCart(
      <>
        <CoffeeCard coffee={coffee} />
        <CoffeeCard coffee={coffee} />
      </>,
    );

    const decreaseButtons = await screen.findAllByRole('button', { name: 'Decrease quantity' });

    await user.click(decreaseButtons[0]);

    await waitFor(() => {
      const cards = screen.getAllByRole('article');

      expect(within(cards[0]).getByText('1')).toBeInTheDocument();

      expect(within(cards[1]).getByText('1')).toBeInTheDocument();
    });

    expect(mocks.updateCartItem).toHaveBeenCalledExactlyOnceWith('customer-token', 'customer-1', 'cart-item-1', 1);
  });

  it('disables controls across cards while an update is pending', async () => {
    mocks.getCart.mockResolvedValue(makeCart(2));

    let finishUpdate: (cart: Cart) => void = () => {
      throw new Error('Update resolver was not initialized.');
    };

    mocks.updateCartItem.mockReturnValueOnce(
      new Promise<Cart>(resolve => {
        finishUpdate = resolve;
      }),
    );

    const { user } = renderWithCart(
      <>
        <CoffeeCard coffee={coffee} />
        <CoffeeCard coffee={coffee} />
      </>,
    );

    const decreaseButtons = await screen.findAllByRole('button', { name: 'Decrease quantity' });

    await user.click(decreaseButtons[0]);

    await waitFor(() => {
      expect(mocks.updateCartItem).toHaveBeenCalledTimes(1);
    });

    for (const button of screen.getAllByRole('button', {
      name: 'Decrease quantity',
    })) {
      expect(button).toBeDisabled();
    }

    for (const button of screen.getAllByRole('button', {
      name: 'Increase quantity',
    })) {
      expect(button).toBeDisabled();
    }

    await act(async () => {
      finishUpdate(makeCart(1));
    });

    await waitFor(() => {
      for (const button of screen.getAllByRole('button', {
        name: 'Decrease quantity',
      })) {
        expect(button).toBeEnabled();
      }
    });
  });
});
