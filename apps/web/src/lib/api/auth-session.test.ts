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
  it('cancels a session lookup when its owning session is replaced', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    const request = getCurrentCustomer('test-token', controller.signal);
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
  });

  it('bounds stalled session lookups without treating a timeout as invalid credentials', async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    try {
      const request = getCurrentCustomer('test-token');
      const rejection = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
      deadline.abort(new DOMException('Session check timed out', 'TimeoutError'));
      await rejection;
      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });

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
