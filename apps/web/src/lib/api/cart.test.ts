import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutCart, recoverCheckout, PaymentCheckoutUnavailableError } from './cart';

const input = {
  paymentProvider: 'cash' as const,
  cartRevision: 3,
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};
afterEach(() => vi.unstubAllGlobals());

describe('Checkout request contract', () => {
  it('sends the same immutable request payload for checkout and recovery', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ checkoutNotCreated: true }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await checkoutCart('token', 'customer/id', input);
    await recoverCheckout('token', 'customer/id', input);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      expect.stringContaining('/customers/customer%2Fid/cart/checkout'),
      expect.stringContaining('/customers/customer%2Fid/cart/checkout/recover'),
    ]);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify(input),
        cache: 'no-store',
        headers: { Authorization: 'Bearer token' },
      });
    }
  });

  it('accepts replay responses with HTTP 200', async () => {
    const replay = { checkoutReplayed: true, paymentProvider: 'cash', order: { id: 'existing' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(replay), { status: 200 })));
    expect(await checkoutCart('token', 'customer', input)).toEqual(replay);
  });

  it('preserves a committed order reference on payment checkout errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 'PAYMENT_CHECKOUT_UNAVAILABLE', orderId: 'existing' }), {
            status: 502,
          }),
        ),
    );
    await expect(checkoutCart('token', 'customer', input)).rejects.toEqual(
      new PaymentCheckoutUnavailableError('existing'),
    );
  });
});
