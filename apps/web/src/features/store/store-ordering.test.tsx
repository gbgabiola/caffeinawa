import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StoreOrderingNotice from './StoreOrderingNotice';
import StoreOrderingPanel from './StoreOrderingPanel';

import type { ReactNode } from 'react';
import type { StoreOrderingStatus } from './store.api';

const mocks = vi.hoisted(() => ({
  getOrdering: vi.fn(),
  updateOrdering: vi.fn(),
  accessToken: 'admin-token' as string | null,
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    accessToken: mocks.accessToken,
  }),
}));

vi.mock('./store.api', () => ({
  getStoreOrdering: mocks.getOrdering,
  updateStoreOrdering: mocks.updateOrdering,
}));

function makeStatus(acceptingOrders: boolean): StoreOrderingStatus {
  return {
    acceptingOrders,
    updatedAt: '2026-10-26T00:00:00.000Z',
  };
}

function renderOrdering(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return {
    queryClient,
    user: userEvent.setup(),
    ...render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>),
  };
}

beforeEach(() => {
  mocks.getOrdering.mockReset();
  mocks.updateOrdering.mockReset();
  mocks.accessToken = 'admin-token';

  mocks.getOrdering.mockResolvedValue(makeStatus(false));
});

describe('StoreOrderingNotice', () => {
  it('shows a loading message before availability is known', () => {
    mocks.getOrdering.mockReturnValue(new Promise<StoreOrderingStatus>(() => {}));

    renderOrdering(<StoreOrderingNotice />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking ordering availability...');
  });

  it.each([
    {
      acceptingOrders: true,
      message: 'Ordering is open. Find your next coffee moment.',
    },
    {
      acceptingOrders: false,
      message: 'Ordering is currently closed. You can browse and prepare your cart for our next selling period.',
    },
  ])('displays availability when acceptingOrders=$acceptingOrders', async ({ acceptingOrders, message }) => {
    mocks.getOrdering.mockResolvedValue(makeStatus(acceptingOrders));

    renderOrdering(<StoreOrderingNotice />);

    expect(await screen.findByText(message)).toHaveAttribute('role', 'status');
  });

  it('recovers from a failed availability request through retry', async () => {
    mocks.getOrdering.mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce(makeStatus(true));

    const { user } = renderOrdering(<StoreOrderingNotice />);

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't check whether ordering is open.");

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Ordering is open. Find your next coffee moment.')).toBeInTheDocument();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.getOrdering).toHaveBeenCalledTimes(2);
  });
});

describe('StoreOrderingPanel', () => {
  it('waits for availability before offering a toggle', () => {
    mocks.getOrdering.mockReturnValue(new Promise<StoreOrderingStatus>(() => {}));

    renderOrdering(<StoreOrderingPanel />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading ordering status...');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    {
      initial: false,
      action: 'Open ordering',
      nextAction: 'Close ordering',
      message: 'Open — accepting new orders',
    },
    {
      initial: true,
      action: 'Close ordering',
      nextAction: 'Open ordering',
      message: 'Closed — browsing only',
    },
  ])('supports $action and updates the shared notice', async ({ initial, action, nextAction, message }) => {
    mocks.getOrdering.mockResolvedValue(makeStatus(initial));
    mocks.updateOrdering.mockResolvedValue(makeStatus(!initial));

    const { user } = renderOrdering(
      <>
        <StoreOrderingPanel />
        <StoreOrderingNotice />
      </>,
    );

    await user.click(await screen.findByRole('button', { name: action }));

    expect(await screen.findByRole('button', { name: nextAction })).toBeEnabled();

    expect(screen.getByText(message)).toBeInTheDocument();

    expect(
      screen.getByText(
        initial
          ? 'Ordering is currently closed. You can browse and prepare your cart for our next selling period.'
          : 'Ordering is open. Find your next coffee moment.',
      ),
    ).toBeInTheDocument();

    expect(mocks.updateOrdering).toHaveBeenCalledExactlyOnceWith('admin-token', !initial);

    // Both components share one availability request.
    expect(mocks.getOrdering).toHaveBeenCalledTimes(1);
  });

  it('disables the toggle while saving and prevents another submission', async () => {
    let finishSave!: (status: StoreOrderingStatus) => void;

    mocks.updateOrdering.mockReturnValueOnce(
      new Promise<StoreOrderingStatus>(resolve => {
        finishSave = resolve;
      }),
    );

    const { user } = renderOrdering(<StoreOrderingPanel />);

    await user.click(await screen.findByRole('button', { name: 'Open ordering' }));

    const savingButton = await screen.findByRole('button', {
      name: 'Saving...',
    });

    expect(savingButton).toBeDisabled();

    await user.click(savingButton);

    expect(mocks.updateOrdering).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishSave(makeStatus(true));
    });

    expect(await screen.findByRole('button', { name: 'Close ordering' })).toBeEnabled();
  });

  it('preserves the current status when saving fails without retrying automatically', async () => {
    mocks.updateOrdering.mockRejectedValue(new Error('Unable to save ordering status.'));

    const { user } = renderOrdering(<StoreOrderingPanel />);

    await user.click(await screen.findByRole('button', { name: 'Open ordering' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save ordering status.');

    expect(screen.getByText('Closed — browsing only')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Open ordering' })).toBeEnabled();

    expect(mocks.updateOrdering).toHaveBeenCalledTimes(1);
  });

  it('recovers from a status-loading error', async () => {
    mocks.getOrdering
      .mockRejectedValueOnce(new Error('Availability unavailable'))
      .mockResolvedValueOnce(makeStatus(false));

    const { user } = renderOrdering(<StoreOrderingPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Availability unavailable');

    expect(screen.queryByRole('button', { name: 'Open ordering' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Open ordering' })).toBeEnabled();
  });

  it('disables the toggle without an access token', async () => {
    mocks.accessToken = null;

    const { user } = renderOrdering(<StoreOrderingPanel />);

    const button = await screen.findByRole('button', {
      name: 'Open ordering',
    });

    expect(button).toBeDisabled();

    await user.click(button);

    expect(mocks.updateOrdering).not.toHaveBeenCalled();
  });

  it('shows an availability error instead of a toggle when a background refresh fails', async () => {
    const { queryClient } = renderOrdering(<StoreOrderingPanel />);

    await screen.findByRole('button', { name: 'Open ordering' });

    mocks.getOrdering.mockRejectedValue(new Error('Refresh failed'));

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['store', 'ordering'],
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Refresh failed');
    });

    expect(screen.queryByRole('button', { name: 'Open ordering' })).not.toBeInTheDocument();

    expect(mocks.updateOrdering).not.toHaveBeenCalled();
  });
});
