import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_PAGE_SIZE } from '@/constants/admin';
import AdminPaymentReconciliationPage from './page';

import type { PaymentReconciliationIssue } from '@/features/payment-reconciliation/payment-reconciliation.api';

const mocks = vi.hoisted(() => ({
  getIssues: vi.fn(),
  reviewIssue: vi.fn(),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    accessToken: 'test-admin-token',
    customer: {
      id: 'admin-1',
      name: 'Test Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
    },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/features/payment-reconciliation/payment-reconciliation.api', () => ({
  getPaymentReconciliationIssues: mocks.getIssues,
  markPaymentReconciliationIssueReviewed: mocks.reviewIssue,
}));

const recordedAt = '2026-10-01T10:00:00.000Z';

function makeIssue(overrides: Partial<PaymentReconciliationIssue> = {}): PaymentReconciliationIssue {
  return {
    id: 'issue-1',
    providerEventId: 'evt_rejected_123',
    checkoutSessionId: 'cs_test_123',
    paymentId: 'payment-1',
    orderId: 'order-1',
    reason: 'INVALID_ORDER_STATUS',
    status: 'OPEN',
    recordedAt,
    reviewedAt: null,
    ...overrides,
  };
}

function makeResponse(
  issues: PaymentReconciliationIssue[],
  options: {
    page?: number;
    pageSize?: number;
    total?: number;
  } = {},
) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? ADMIN_PAGE_SIZE;
  const total = options.total ?? issues.length;

  return {
    data: issues,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function getOpenCountCard() {
  const card = screen.getByText('Open reconciliation issues').parentElement;

  if (!card) {
    throw new Error('Open reconciliation count card was not found.');
  }

  return within(card);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AdminPaymentReconciliationPage />
      </QueryClientProvider>,
    ),
  };
}

describe('AdminPaymentReconciliationPage', () => {
  beforeEach(() => {
    mocks.getIssues.mockImplementation(
      async (
        _token: string,
        query: {
          page: number;
          pageSize: number;
          search?: string;
          status?: string;
        },
      ) => {
        if (query.status === 'OPEN' && query.pageSize === 1) {
          return makeResponse([makeIssue()], {
            pageSize: 1,
            total: 1,
          });
        }

        return makeResponse([makeIssue()]);
      },
    );

    mocks.reviewIssue.mockResolvedValue(
      makeIssue({
        status: 'REVIEWED',
        reviewedAt: recordedAt,
      }),
    );

    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('loads open issues and displays the global open count', async () => {
    renderPage();

    expect(screen.getByText('Loading reconciliation issues...')).toBeInTheDocument();

    expect(await screen.findByText('Invalid order status')).toBeInTheDocument();

    expect(screen.getByText('cs_test_123')).toBeInTheDocument();

    expect(mocks.getIssues).toHaveBeenCalledWith(
      'test-admin-token',
      expect.objectContaining({
        page: 1,
        pageSize: ADMIN_PAGE_SIZE,
        status: 'OPEN',
      }),
    );

    expect(mocks.getIssues).toHaveBeenCalledWith('test-admin-token', {
      page: 1,
      pageSize: 1,
      status: 'OPEN',
    });

    await waitFor(() => {
      expect(getOpenCountCard().getByText('1')).toBeInTheDocument();
    });
  });

  it('passes the search input to the API query', async () => {
    const { user } = renderPage();

    const search = screen.getByPlaceholderText('Search event, session, payment or order ID...');

    await user.type(search, 'evt_rejected_123');

    await waitFor(() => {
      expect(mocks.getIssues).toHaveBeenCalledWith(
        'test-admin-token',
        expect.objectContaining({
          search: 'evt_rejected_123',
        }),
      );
    });
  });

  it('filters by reviewed status', async () => {
    const { user } = renderPage();

    await screen.findByText('cs_test_123');

    await user.selectOptions(screen.getByLabelText('Status'), 'REVIEWED');

    await waitFor(() => {
      expect(mocks.getIssues).toHaveBeenCalledWith(
        'test-admin-token',
        expect.objectContaining({
          status: 'REVIEWED',
          page: 1,
        }),
      );
    });
  });

  it('loads the next page when pagination changes', async () => {
    mocks.getIssues.mockImplementation(
      async (
        _token: string,
        query: {
          page: number;
          pageSize: number;
          status?: string;
        },
      ) => {
        if (query.pageSize === 1) {
          return makeResponse([makeIssue()], {
            pageSize: 1,
            total: ADMIN_PAGE_SIZE + 2,
          });
        }

        const issue = makeIssue({
          id: `issue-page-${query.page}`,
          checkoutSessionId: `cs_page_${query.page}`,
        });

        return makeResponse([issue], {
          page: query.page,
          pageSize: query.pageSize,
          total: ADMIN_PAGE_SIZE + 2,
        });
      },
    );

    const { user } = renderPage();

    await screen.findByText('cs_page_1');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('cs_page_2')).toBeInTheDocument();

    expect(mocks.getIssues).toHaveBeenCalledWith(
      'test-admin-token',
      expect.objectContaining({
        page: 2,
      }),
    );
  });

  it('expands issue details', async () => {
    const { user } = renderPage();

    await screen.findByText('cs_test_123');

    await user.click(
      screen.getByRole('button', {
        name: 'View details',
      }),
    );

    expect(screen.getByText('evt_rejected_123')).toBeInTheDocument();

    expect(screen.getByText('payment-1')).toBeInTheDocument();

    expect(screen.getByText('order-1')).toBeInTheDocument();
  });

  it('marks an issue reviewed and refreshes the queries', async () => {
    let reviewed = false;

    mocks.reviewIssue.mockImplementation(async () => {
      reviewed = true;

      return makeIssue({
        status: 'REVIEWED',
        reviewedAt: recordedAt,
      });
    });

    mocks.getIssues.mockImplementation(
      async (
        _token: string,
        query: {
          pageSize: number;
          status?: string;
        },
      ) => {
        if (query.pageSize === 1) {
          return makeResponse(reviewed ? [] : [makeIssue()], {
            pageSize: 1,
            total: reviewed ? 0 : 1,
          });
        }

        return makeResponse(reviewed ? [] : [makeIssue()]);
      },
    );

    const { user } = renderPage();

    await screen.findByText('cs_test_123');

    await waitFor(() => {
      expect(getOpenCountCard().getByText('1')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', {
        name: 'Mark Reviewed',
      }),
    );

    await waitFor(() => {
      expect(mocks.reviewIssue).toHaveBeenCalledExactlyOnceWith('test-admin-token', 'issue-1');
    });

    await waitFor(() => {
      expect(screen.getByText('No reconciliation issues found.')).toBeInTheDocument();
    });

    expect(window.confirm).toHaveBeenCalledExactlyOnceWith(
      'Mark this reconciliation issue as reviewed? ' + 'This does not refund, settle, or update the payment.',
    );

    await waitFor(() => {
      expect(getOpenCountCard().getByText('0')).toBeInTheDocument();
    });
  });

  it('does not review an issue when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);

    const { user } = renderPage();

    await screen.findByText('cs_test_123');

    await user.click(
      screen.getByRole('button', {
        name: 'Mark Reviewed',
      }),
    );

    expect(mocks.reviewIssue).not.toHaveBeenCalled();
  });

  it('shows an API loading error', async () => {
    mocks.getIssues.mockRejectedValue(new Error('Unable to reach payment API'));

    renderPage();

    expect(await screen.findByText('Unable to reach payment API')).toHaveAttribute('role', 'alert');
  });

  it('shows a review-action error', async () => {
    mocks.reviewIssue.mockRejectedValue(new Error('Review request failed'));

    const { user } = renderPage();

    await screen.findByText('cs_test_123');

    await user.click(
      screen.getByRole('button', {
        name: 'Mark Reviewed',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Review request failed');
  });

  it('shows empty-state messaging', async () => {
    mocks.getIssues.mockResolvedValue(makeResponse([]));

    renderPage();

    expect(await screen.findByText('No reconciliation issues found.')).toBeInTheDocument();
  });
});
