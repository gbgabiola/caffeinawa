import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CartPage from './page';
import type { Cart } from '@caffeinawa/types';

const mocks = vi.hoisted(() => ({
  getCart: vi.fn(), updateCartItem: vi.fn(), removeCartItem: vi.fn(), clearCart: vi.fn(),
}));
vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ customer: { id: 'customer-1' }, accessToken: 'token', isAuthenticated: true, isLoading: false }),
}));
vi.mock('@/lib/api/cart', () => mocks);
vi.mock('@/lib/cart-events', () => ({ notifyCartChanged: vi.fn() }));

function cart(quantity: number): Cart {
  return { id: 'cart-1', revision: 0, customerId: 'customer-1', total: quantity * 100, items: [{
    id: 'item-1', coffeeId: 'coffee-1', quantity, subtotal: quantity * 100,
    coffee: { id: 'coffee-1', name: 'Latte', price: 100, available: true },
  }] };
}

describe('Cart quantity limits', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('allows the 99th drink then disables increment while decrement remains usable', async () => {
    mocks.getCart.mockResolvedValue(cart(98));
    mocks.updateCartItem.mockResolvedValue(cart(99));
    const user = userEvent.setup();
    render(<CartPage />);
    await user.click(await screen.findByRole('button', { name: 'Increase quantity of Latte' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Increase quantity of Latte' })).toBeDisabled());
    expect(mocks.updateCartItem).toHaveBeenCalledWith('token', 'customer-1', 'item-1', 99);
    expect(screen.getByRole('button', { name: 'Decrease quantity of Latte' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Continue to checkout' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('shows legacy quantities unchanged and requires an explicit correction before checkout', async () => {
    mocks.getCart.mockResolvedValue(cart(101));
    mocks.updateCartItem.mockResolvedValue(cart(99));
    const user = userEvent.setup();
    render(<CartPage />);
    const reduce = await screen.findByRole('button', { name: 'Reduce quantity of Latte to 99' });
    expect(screen.getByText('101', { selector: 'span[aria-live]' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to checkout' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Increase quantity of Latte' })).toBeDisabled();
    expect(mocks.updateCartItem).not.toHaveBeenCalled();
    await user.click(reduce);
    await waitFor(() => expect(mocks.updateCartItem).toHaveBeenCalledWith('token', 'customer-1', 'item-1', 99));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Continue to checkout' })).toHaveAttribute('aria-disabled', 'false'));
  });

  it('allows removing an over-limit item', async () => {
    mocks.getCart.mockResolvedValue(cart(101));
    mocks.removeCartItem.mockResolvedValue({ ...cart(0), items: [] });
    const user = userEvent.setup();
    render(<CartPage />);
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(mocks.removeCartItem).toHaveBeenCalledWith('token', 'customer-1', 'item-1');
    expect(await screen.findByRole('heading', { name: 'Your cart is waiting.' })).toBeInTheDocument();
  });
});

