import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CartPage from './cart/page';
import CheckoutPage from './checkout/page';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getCart: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
  }),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('@/lib/api/cart', () => ({
  getCart: mocks.getCart,
  clearCart: vi.fn(),
  removeCartItem: vi.fn(),
  updateCartItem: vi.fn(),
  checkoutCart: vi.fn(),
  isPayMongoCheckoutResponse: vi.fn(),
}));

const pages = [
  {
    name: 'Cart',
    Page: CartPage,
    heading: 'Sign in to view your cart',
  },
  {
    name: 'Checkout',
    Page: CheckoutPage,
    heading: 'Sign in to checkout',
  },
];

describe.each(pages)('$name authentication', ({ Page, heading }) => {
  beforeEach(() => {
    mocks.getCart.mockReset();
    mocks.replace.mockReset();

    mocks.useAuth.mockReturnValue({
      customer: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('shows the signed-out prompt without loading the cart', () => {
    render(<Page />);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');

    expect(mocks.getCart).not.toHaveBeenCalled();
  });

  it('waits for authentication before loading the cart', () => {
    mocks.useAuth.mockReturnValue({
      customer: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
    });

    render(<Page />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking your session...');

    expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();

    expect(mocks.getCart).not.toHaveBeenCalled();
  });
});
