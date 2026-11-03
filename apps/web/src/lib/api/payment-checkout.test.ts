import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPaymentCheckoutStatus, resumePaymentCheckout } from './payment-checkout';

afterEach(() => vi.unstubAllGlobals());
describe('Payment checkout API', () => {
  it('explains rate limiting without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(resumePaymentCheckout('token', 'order')).rejects.toThrow('Please wait a minute');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests authenticated no-store capabilities and explicit resume with encoded order IDs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ canResume: true, message: 'Continue' }))
      .mockResolvedValueOnce(
        Response.json({ status: 'ready', checkoutUrl: 'https://checkout.paymongo.com/existing' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await getPaymentCheckoutStatus('token', 'order/id');
    expect(await resumePaymentCheckout('token', 'order/id')).toEqual({
      status: 'ready',
      checkoutUrl: 'https://checkout.paymongo.com/existing',
    });
    expect(fetchMock.mock.calls[0]).toEqual([
      expect.stringContaining('/orders/order%2Fid/payment-checkout'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
      }),
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      expect.stringContaining('/orders/order%2Fid/payment-checkout/resume'),
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    ]);
  });

  it.each([
    'https://attacker.example.test',
    'http://checkout.paymongo.com/test',
    'https://user:password@checkout.paymongo.com/test',
    'javascript:alert(1)',
  ])('refuses unsafe redirects %s', async checkoutUrl => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ready', checkoutUrl })));
    await expect(resumePaymentCheckout('token', 'order')).rejects.toThrow();
  });

  it('does not expose an upstream error body or retry a failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('private-upstream-body', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(resumePaymentCheckout('token', 'order')).rejects.toThrow('Check this order');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed payment capabilities', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ canResume: 'true', message: 'Continue' })),
    );
    await expect(getPaymentCheckoutStatus('token', 'order')).rejects.toThrow('Unable to verify');
  });
});
