import { BadGatewayException, ConflictException, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayMongoService } from './paymongo.service.js';

const paymentId = '00000000-0000-4000-8000-000000000001';
const input = {
  orderId: 'order-1',
  customerName: 'Test Customer',
  customerEmail: 'test@example.test',
  items: [{ name: 'Latte', quantity: 2, unitPrice: 125.5 }],
};
const now = new Date('2026-11-04T00:00:00Z');
const fetchMock = vi.fn<typeof fetch>();
function payload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 'cs_test',
      type: 'checkout_session',
      attributes: {
        reference_number: input.orderId,
        checkout_url: 'https://checkout.paymongo.com/test',
        livemode: false,
        status: 'active',
        line_items: [{ amount: 12550, currency: 'PHP', quantity: 2 }],
        payments: [],
        payment_intent: null,
        ...overrides,
      },
    },
  };
}
let service: PayMongoService;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('PAYMONGO_SECRET_KEY', 'synthetic-secret');
  vi.stubEnv('PAYMONGO_MODE', 'test');
  vi.stubEnv('PAYMONGO_API_URL', 'https://api.paymongo.com');
  vi.stubEnv('WEB_URL', 'https://caffeinawa.pages.dev');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  service = new PayMongoService();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PayMongo recovery transport', () => {
  it('sends the stored body and key, including after callback configuration changes', async () => {
    const snapshot = {
      ...service.prepareCheckoutSession(input),
      paymentId,
      createdAt: now,
      startedAt: now,
    };
    vi.stubEnv('WEB_URL', 'https://new.example.test');
    service = new PayMongoService();
    fetchMock.mockImplementation(async () => Response.json(payload()));
    await service.createCheckoutSession(snapshot, input.orderId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe('https://api.paymongo.com/v2/checkout_sessions');
      expect(call[1]?.body).toBe(snapshot.requestBody);
      expect(call[1]?.headers).toMatchObject({ 'Idempotency-Key': paymentId });
    }
    expect(snapshot.requestBody).not.toContain('new.example.test');
    expect(snapshot.requestBody).not.toContain('synthetic-secret');
  });

  it.each([23, 24, 25])(
    'refuses creation recovery at or after %s hours',
    async (hours) => {
      const snapshot = {
        ...service.prepareCheckoutSession(input),
        paymentId,
        createdAt: new Date(now.getTime() - hours * 3600000),
        startedAt: now,
      };
      await expect(
        service.createCheckoutSession(snapshot, input.orderId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['PAYMONGO_SECRET_KEY', 'PAYMONGO_MODE', 'PAYMONGO_API_URL'])(
    'refuses creation after changing %s',
    async (name) => {
      const snapshot = {
        ...service.prepareCheckoutSession(input),
        paymentId,
        createdAt: now,
        startedAt: now,
      };
      vi.stubEnv(
        name,
        name === 'PAYMONGO_MODE'
          ? 'live'
          : name === 'PAYMONGO_API_URL'
            ? 'https://other.example.test'
            : 'rotated-synthetic-secret',
      );
      service = new PayMongoService();
      await expect(
        service.createCheckoutSession(snapshot, input.orderId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('retrieves a known session using the documented V1 GET without an idempotency header', async () => {
    fetchMock.mockResolvedValue(Response.json(payload()));
    expect(
      await service.retrieveCheckoutSession('cs_test', input.orderId, 25100),
    ).toMatchObject({ status: 'active', paymentState: 'unpaid' });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://api.paymongo.com/v1/checkout_sessions/cs_test',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(fetchMock.mock.calls[0]![1]!.headers).not.toHaveProperty(
      'Idempotency-Key',
    );
  });

  it.each([
    { reference_number: 'different' },
    { reference_number: undefined },
    { livemode: true },
    { status: 'unknown' },
    { checkout_url: 'https://attacker.example.test/checkout' },
    { line_items: [] },
    { payments: null },
    { line_items: [{ amount: 12551, currency: 'PHP', quantity: 2 }] },
    { line_items: [{ amount: 12550, currency: 'USD', quantity: 2 }] },
    { line_items: [{ amount: 12550, currency: 'PHP', quantity: 2.1 }] },
    { payments: [{}] },
    { payment_intent: {} },
  ])('rejects an unsafe retrieval response %j', async (overrides) => {
    fetchMock.mockResolvedValue(Response.json(payload(overrides)));
    await expect(
      service.retrieveCheckoutSession('cs_test', input.orderId, 25100),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a response for another session', async () => {
    const wrong = payload();
    wrong.data.id = 'cs_other';
    fetchMock.mockResolvedValue(Response.json(wrong));
    await expect(
      service.retrieveCheckoutSession('cs_test', input.orderId, 25100),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it.each(['paid', 'pending', 'processing', 'unknown'])(
    'detects %s payments conservatively',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json(
          payload({ payments: [{ type: 'payment', attributes: { status } }] }),
        ),
      );
      expect(
        (await service.retrieveCheckoutSession('cs_test', input.orderId, 25100))
          .paymentState,
      ).toBe(status === 'paid' ? 'paid' : 'processing');
    },
  );

  it('detects a succeeded payment intent even before payment details are present', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        payload({
          payment_intent: {
            type: 'payment_intent',
            attributes: { status: 'succeeded' },
          },
        }),
      ),
    );
    expect(
      (await service.retrieveCheckoutSession('cs_test', input.orderId, 25100))
        .paymentState,
    ).toBe('paid');
  });

  it('bounds retrieval and never retries it automatically', async () => {
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options!.signal!.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          ),
        ),
    );
    const result = expect(
      service.retrieveCheckoutSession('cs_test', input.orderId, 25100),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await vi.advanceTimersByTimeAsync(10000);
    await result;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
