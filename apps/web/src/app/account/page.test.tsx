import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountPage from './page';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  updateCustomer: vi.fn(),
  logout: vi.fn(),
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

beforeEach(() => {
  mocks.useAuth.mockReset();
  mocks.updateCustomer.mockReset();
  mocks.logout.mockReset();
  mocks.replace.mockReset();

  mocks.updateCustomer.mockResolvedValue(undefined);

  mocks.useAuth.mockReturnValue({
    customer: {
      id: 'customer-1',
      name: 'Test Customer',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    },
    isAuthenticated: true,
    isLoading: false,
    updateCustomer: mocks.updateCustomer,
    logout: mocks.logout,
  });
});

describe('AccountPage', () => {
  it('shows profile fields as read-only initially', () => {
    render(<AccountPage />);

    expect(screen.getByLabelText('Name')).toHaveValue('Test Customer');
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');

    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('discards unsaved changes when editing is cancelled', async () => {
    const user = userEvent.setup();

    render(<AccountPage />);

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));

    const nameInput = screen.getByLabelText('Name');

    await user.clear(nameInput);
    await user.type(nameInput, 'Unsaved Customer');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Test Customer');
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
  });

  it('submits trimmed profile values and confirms the save', async () => {
    const user = userEvent.setup();

    render(<AccountPage />);

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));

    const nameInput = screen.getByLabelText('Name');

    await user.clear(nameInput);
    await user.type(nameInput, '  Updated Customer  ');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.updateCustomer).toHaveBeenCalledExactlyOnceWith({
        name: 'Updated Customer',
        email: 'customer@example.com',
      });
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Your profile has been updated.');

    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument();
  });

  it('preserves the draft when saving fails', async () => {
    mocks.updateCustomer.mockRejectedValue(new Error('Request failed'));

    const user = userEvent.setup();

    render(<AccountPage />);

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));

    const nameInput = screen.getByLabelText('Name');

    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Customer');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to update your profile.');

    expect(screen.getByLabelText('Name')).toHaveValue('Updated Customer');

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('redirects signed-out visitors with an account return path', async () => {
    mocks.useAuth.mockReturnValue({
      customer: null,
      isAuthenticated: false,
      isLoading: false,
      updateCustomer: mocks.updateCustomer,
      logout: mocks.logout,
    });

    render(<AccountPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login?next=%2Faccount');
    });

    expect(screen.queryByRole('heading', { name: 'Profile details' })).not.toBeInTheDocument();
  });

  it('signs out using the existing authentication provider', async () => {
    const user = userEvent.setup();

    render(<AccountPage />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith('/login');
  });
});
