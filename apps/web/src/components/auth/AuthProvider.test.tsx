import { act, render, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from './AuthProvider';

const TOKEN_KEY = 'caffeinawa_access_token';

const mocks = vi.hoisted(() => ({
  getCurrentCustomer: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  getCurrentCustomer: mocks.getCurrentCustomer,
  login: vi.fn(),
  register: vi.fn(),
  updateCurrentCustomer: vi.fn(),
}));

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
  const { customer, isLoading } = useAuth();

  if (isLoading) {
    return <p role="status">Loading session...</p>;
  }

  return <p>{customer?.name ?? 'Signed out'}</p>;
}

function renderSession() {
  return render(
    <AuthProvider>
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
});
