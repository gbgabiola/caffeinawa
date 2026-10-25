import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthRequestError } from '@/lib/api/auth';
import { AuthProvider, useAuth } from './AuthProvider';
import SessionNotice from './SessionNotice';

const TOKEN_KEY = 'caffeinawa_access_token';

const mocks = vi.hoisted(() => ({
  getCurrentCustomer: vi.fn(),
  updateCurrentCustomer: vi.fn(),
}));

vi.mock('@/lib/api/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/auth')>();

  return {
    ...actual,
    getCurrentCustomer: mocks.getCurrentCustomer,
    updateCurrentCustomer: mocks.updateCurrentCustomer,
    login: vi.fn(),
    register: vi.fn(),
  };
});

const firstCustomer = {
  id: 'customer-1',
  name: 'Customer One',
  email: 'one@example.com',
  role: 'CUSTOMER',
};

const secondCustomer = {
  id: 'customer-2',
  name: 'Customer Two',
  email: 'two@example.com',
  role: 'CUSTOMER',
};

function SessionProbe() {
  const { customer, isLoading, updateCustomer } = useAuth();

  if (isLoading) {
    return <p role="status">Loading session...</p>;
  }

  return (
    <>
      <p>{customer?.name ?? 'Signed out'}</p>

      {customer && (
        <button
          type="button"
          onClick={() =>
            void updateCustomer({
              name: 'Updated Customer',
            })
          }
        >
          Save profile
        </button>
      )}
    </>
  );
}

function renderSession() {
  return render(
    <AuthProvider>
      <SessionNotice />
      <SessionProbe />
    </AuthProvider>,
  );
}

function changeTokenFromAnotherTab(token: string | null) {
  const oldValue = window.localStorage.getItem(TOKEN_KEY);

  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }

  window.dispatchEvent(
    new StorageEvent('storage', {
      key: TOKEN_KEY,
      oldValue,
      newValue: token,
      storageArea: window.localStorage,
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.getCurrentCustomer.mockReset();
  mocks.updateCurrentCustomer.mockReset();
});

describe('AuthProvider session synchronization', () => {
  it('restores the customer belonging to the stored token', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    mocks.getCurrentCustomer.mockResolvedValue(firstCustomer);

    renderSession();

    expect(await screen.findByText('Customer One')).toBeInTheDocument();

    expect(mocks.getCurrentCustomer).toHaveBeenCalledExactlyOnceWith('token-one');
  });

  it('signs out when another tab removes the token', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    mocks.getCurrentCustomer.mockResolvedValue(firstCustomer);

    renderSession();

    await screen.findByText('Customer One');

    act(() => {
      changeTokenFromAnotherTab(null);
    });

    expect(await screen.findByText('Signed out')).toBeInTheDocument();

    expect(screen.queryByText('Customer One')).not.toBeInTheDocument();
  });

  it('hides the previous customer while a replacement session loads', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    let finishSecondRequest: (customer: typeof secondCustomer) => void = () => {
      throw new Error('Resolver was not initialized.');
    };

    const secondRequest = new Promise<typeof secondCustomer>(resolve => {
      finishSecondRequest = resolve;
    });

    mocks.getCurrentCustomer.mockResolvedValueOnce(firstCustomer).mockReturnValueOnce(secondRequest);

    renderSession();

    await screen.findByText('Customer One');

    act(() => {
      changeTokenFromAnotherTab('token-two');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Loading session...');

    expect(screen.queryByText('Customer One')).not.toBeInTheDocument();

    await act(async () => {
      finishSecondRequest(secondCustomer);
    });

    expect(await screen.findByText('Customer Two')).toBeInTheDocument();
  });

  it('ignores an old request that finishes after the new session', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    let finishFirstRequest: (customer: typeof firstCustomer) => void = () => {
      throw new Error('Resolver was not initialized.');
    };

    const firstRequest = new Promise<typeof firstCustomer>(resolve => {
      finishFirstRequest = resolve;
    });

    mocks.getCurrentCustomer.mockImplementation((token: string) =>
      token === 'token-one' ? firstRequest : Promise.resolve(secondCustomer),
    );

    renderSession();

    act(() => {
      changeTokenFromAnotherTab('token-two');
    });

    await screen.findByText('Customer Two');

    await act(async () => {
      finishFirstRequest(firstCustomer);
    });

    expect(screen.getByText('Customer Two')).toBeInTheDocument();

    expect(screen.queryByText('Customer One')).not.toBeInTheDocument();
  });

  it('reloads the customer when another tab announces a profile update', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    mocks.getCurrentCustomer.mockResolvedValueOnce(firstCustomer).mockResolvedValueOnce({
      ...firstCustomer,
      name: 'Updated Customer',
    });

    renderSession();

    await screen.findByText('Customer One');

    act(() => {
      window.localStorage.setItem('caffeinawa_profile_updated', 'test-profile-update');

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'caffeinawa_profile_updated',
          newValue: 'test-profile-update',
          storageArea: window.localStorage,
        }),
      );
    });

    expect(await screen.findByText('Updated Customer')).toBeInTheDocument();

    expect(mocks.getCurrentCustomer).toHaveBeenCalledTimes(2);

    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('token-one');
  });

  it('updates the current customer and publishes a profile notification after saving', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    mocks.getCurrentCustomer.mockResolvedValue(firstCustomer);

    mocks.updateCurrentCustomer.mockResolvedValue({
      ...firstCustomer,
      name: 'Updated Customer',
    });

    const user = userEvent.setup();

    renderSession();

    await screen.findByText('Customer One');

    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');

    try {
      await user.click(
        screen.getByRole('button', {
          name: 'Save profile',
        }),
      );

      expect(await screen.findByText('Updated Customer')).toBeInTheDocument();

      expect(mocks.updateCurrentCustomer).toHaveBeenCalledExactlyOnceWith('token-one', { name: 'Updated Customer' });

      await waitFor(() => {
        expect(storageSpy).toHaveBeenCalledWith('caffeinawa_profile_updated', expect.any(String));
      });
    } finally {
      storageSpy.mockRestore();
    }
  });

  it('keeps the token after a network failure and recovers through retry', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    mocks.getCurrentCustomer
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(firstCustomer);

    const user = userEvent.setup();

    renderSession();

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't check your account.");

    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('token-one');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Customer One')).toBeInTheDocument();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    expect(mocks.getCurrentCustomer).toHaveBeenCalledTimes(2);
  });

  it('clears the session when the API returns 401', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    mocks.getCurrentCustomer.mockRejectedValue(new AuthRequestError(401, 'Session expired'));

    renderSession();

    expect(await screen.findByText('Signed out')).toBeInTheDocument();

    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the loaded customer when a background refresh returns 503', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'token-one');

    mocks.getCurrentCustomer
      .mockResolvedValueOnce(firstCustomer)
      .mockRejectedValueOnce(new AuthRequestError(503, 'Service unavailable'));

    renderSession();

    await screen.findByText('Customer One');

    act(() => {
      window.localStorage.setItem('caffeinawa_profile_updated', 'background-refresh');

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'caffeinawa_profile_updated',
          newValue: 'background-refresh',
          storageArea: window.localStorage,
        }),
      );
    });

    await screen.findByRole('alert');

    expect(screen.getByText('Customer One')).toBeInTheDocument();

    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('token-one');
  });
});
