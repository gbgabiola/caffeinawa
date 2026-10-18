import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentReconciliationIssue } from './payment-reconciliation.api';

const API_URL = 'https://api.example.test/api';
const BASE_PATH = '/admin/payments/reconciliation/issues';
const ACCESS_TOKEN = 'test-admin-token';

const fetchMock = vi.fn<typeof fetch>();

let api: typeof import('./payment-reconciliation.api');

const issue: PaymentReconciliationIssue = {
  id: 'issue-1',
  providerEventId: 'evt_test_123',
  checkoutSessionId: 'cs_test_123',
  paymentId: 'payment-1',
  orderId: 'order-1',
  reason: 'INVALID_ORDER_STATUS',
  status: 'OPEN',
  recordedAt: '2026-10-01T10:00:00.000Z',
  reviewedAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getOnlyRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const [input, options] = fetchMock.mock.calls[0];

  expect(typeof input).toBe('string');

  return {
    url: new URL(String(input)),
    options,
    headers: new Headers(options?.headers),
  };
}

beforeEach(async () => {
  // API_URL is read when admin-client.ts is imported.
  vi.resetModules();
  fetchMock.mockReset();

  vi.stubEnv('NEXT_PUBLIC_API_URL', API_URL);
  vi.stubGlobal('fetch', fetchMock);

  api = await import('./payment-reconciliation.api');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('payment reconciliation API', () => {
  it('serializes list filters and sends the admin JWT', async () => {
    const response = {
      data: [issue],
      meta: {
        page: 2,
        pageSize: 5,
        total: 6,
        totalPages: 2,
      },
    };

    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(
      api.getPaymentReconciliationIssues(ACCESS_TOKEN, {
        page: 2,
        pageSize: 5,
        search: 'evt/a & b?=+#',
        status: 'OPEN',
      }),
    ).resolves.toEqual(response);

    const { url, options, headers } = getOnlyRequest();

    expect(`${url.origin}${url.pathname}`).toBe(`${API_URL}${BASE_PATH}`);

    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      page: '2',
      pageSize: '5',
      search: 'evt/a & b?=+#',
      status: 'OPEN',
    });

    expect(headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(options?.cache).toBe('no-store');

    // fetch defaults to GET when the client omits method.
    expect(options?.method ?? 'GET').toBe('GET');
    expect(options?.body).toBeUndefined();
  });

  it('omits empty and undefined optional filters', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [],
        meta: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 1,
        },
      }),
    );

    await api.getPaymentReconciliationIssues(ACCESS_TOKEN, {
      page: 1,
      pageSize: 10,
      search: '',
      status: undefined,
    });

    const { url } = getOnlyRequest();

    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      page: '1',
      pageSize: '10',
    });
  });

  it('encodes the issue ID and sends an authenticated PATCH', async () => {
    const issueId = 'issue/a b?x=1#fragment';
    const reviewedIssue: PaymentReconciliationIssue = {
      ...issue,
      id: issueId,
      status: 'REVIEWED',
      reviewedAt: '2026-10-02T10:00:00.000Z',
    };

    fetchMock.mockResolvedValueOnce(jsonResponse(reviewedIssue));

    await expect(api.markPaymentReconciliationIssueReviewed(ACCESS_TOKEN, issueId)).resolves.toEqual(reviewedIssue);

    const { url, options, headers } = getOnlyRequest();

    expect(url.href).toBe(`${API_URL}${BASE_PATH}/${encodeURIComponent(issueId)}/review`);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');

    expect(options?.method).toBe('PATCH');
    expect(options?.body).toBeUndefined();
    expect(options?.cache).toBe('no-store');

    expect(headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it.each([
    {
      status: 401,
      message: 'Authentication required.',
    },
    {
      status: 403,
      message: 'Administrator access required.',
    },
  ])('preserves HTTP $status and uses its fallback message', async ({ status, message }) => {
    fetchMock.mockResolvedValueOnce(new Response('', { status }));

    await expect(
      api.getPaymentReconciliationIssues(ACCESS_TOKEN, {
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status,
      message,
    });

    // The shared HTTP client makes one attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves a server-provided authorization error message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Your session has expired.' }, 401));

    await expect(api.markPaymentReconciliationIssueReviewed(ACCESS_TOKEN, issue.id)).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Your session has expired.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('joins Nest validation messages without losing HTTP status', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          message: ['page must be a positive number', 'status must be a valid enum value'],
        },
        400,
      ),
    );

    await expect(
      api.getPaymentReconciliationIssues(ACCESS_TOKEN, {
        page: 0,
        pageSize: 10,
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'page must be a positive number, ' + 'status must be a valid enum value',
    });
  });

  it('uses the status fallback when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Forbidden</html>', {
        status: 403,
      }),
    );

    await expect(api.markPaymentReconciliationIssueReviewed(ACCESS_TOKEN, issue.id)).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Administrator access required.',
    });
  });

  it('propagates network failures without retrying', async () => {
    const error = new TypeError('Network request failed');

    fetchMock.mockRejectedValueOnce(error);

    await expect(
      api.getPaymentReconciliationIssues(ACCESS_TOKEN, {
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toBe(error);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
