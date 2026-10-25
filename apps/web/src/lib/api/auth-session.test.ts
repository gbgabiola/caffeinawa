import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthRequestError, getCurrentCustomer } from './auth';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCurrentCustomer failures', () => {
  it.each([401, 403, 503])('preserves HTTP status %s', async status => {
    fetchMock.mockResolvedValueOnce(new Response('', { status }));

    const error = await getCurrentCustomer('test-token').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AuthRequestError);
    expect(error).toMatchObject({ status });
  });

  it('preserves network failures without inventing an HTTP status', async () => {
    const error = new TypeError('Failed to fetch');

    fetchMock.mockRejectedValueOnce(error);

    await expect(getCurrentCustomer('test-token')).rejects.toBe(error);
  });
});
