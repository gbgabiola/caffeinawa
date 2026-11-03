import {
  BadGatewayException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PayMongoService } from './paymongo.service.js';

const nativeFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();
const input = {
  orderId: 'order-1',
  amount: 251,
  items: [{ name: 'Latte', quantity: 2, unitPrice: 125.5 }],
  customerName: 'Test Customer',
  customerEmail: 'customer@example.com',
};

function payload(url = 'https://checkout.example.com/session') {
  return {
    data: {
      id: 'cs_fixture',
      type: 'checkout_session',
      attributes: {
        checkout_url: url,
        reference_number: input.orderId,
      },
    },
  };
}

describe('PayMongo checkout transport', () => {
  let service: PayMongoService;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubEnv('PAYMONGO_SECRET_KEY', 'synthetic-provider-key');
    vi.stubEnv('PAYMONGO_API_URL', 'https://api.paymongo.com/');
    vi.stubEnv('WEB_URL', 'https://caffeinawa.pages.dev');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMONGO_MODE', 'test');
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new PayMongoService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('makes one bounded, redirect-free request and returns the validated session', async () => {
    fetchMock.mockResolvedValue(Response.json(payload()));
    await expect(service.createCheckoutSession(input)).resolves.toEqual({
      sessionId: 'cs_fixture',
      checkoutUrl: 'https://checkout.example.com/session',
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://api.paymongo.com/v2/checkout_sessions',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.data.attributes).toMatchObject({
      reference_number: input.orderId,
      line_items: [
        { name: 'Latte', amount: 12550, currency: 'PHP', quantity: 2 },
      ],
      payment_method_types: ['qrph'],
    });
    expect(body.data.attributes.success_url).toBe(
      'https://caffeinawa.pages.dev/checkout/success?orderId=order-1',
    );
  });

  it.each([
    null,
    {},
    { data: null },
    { data: [] },
    { data: { ...payload().data, type: 'payment' } },
    { data: { ...payload().data, id: '' } },
    { data: { ...payload().data, id: ' cs_fixture' } },
    { data: { ...payload().data, attributes: {} } },
    {
      data: {
        ...payload().data,
        attributes: {
          ...payload().data.attributes,
          reference_number: 'another-order',
        },
      },
    },
    payload('javascript:alert(1)'),
    payload('http://checkout.example.com/session'),
    payload('https://user:password@checkout.example.com/session'),
    payload('/session'),
  ])('rejects malformed or unsafe session responses', async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(service.createCheckoutSession(input)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts a response that omits the optional reference number', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        data: {
          ...payload().data,
          attributes: { checkout_url: 'https://checkout.example.com/session' },
        },
      }),
    );
    await expect(service.createCheckoutSession(input)).resolves.toMatchObject({
      sessionId: 'cs_fixture',
    });
  });

  it.each([302, 400, 401, 429, 500])(
    'does not expose provider bodies or retry HTTP %s',
    async (status) => {
      const response = new Response('private-provider-body', { status });
      const readBody = vi.spyOn(response, 'text');
      fetchMock.mockResolvedValue(response);
      const error = await service
        .createCheckoutSession(input)
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(BadGatewayException);
      expect(JSON.stringify(error)).not.toContain('private-provider-body');
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining(`HTTP ${status}`),
      );
      expect(readBody).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledOnce();
      const signal = fetchMock.mock.calls[0]![1]!.signal!;
      expect(signal.aborted).toBe(true);
    },
  );

  it('hides transport error details and never retries a failed request', async () => {
    fetchMock.mockRejectedValue(
      new Error('private transport details synthetic-provider-key'),
    );
    const error = await service
      .createCheckoutSession(input)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(error)).not.toContain('private transport');
    expect(
      JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls),
    ).not.toContain('synthetic-provider-key');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps invalid JSON to a safe provider failure', async () => {
    fetchMock.mockResolvedValue(new Response('private-invalid-json'));
    const error = await service
      .createCheckoutSession(input)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(error)).not.toContain('private-invalid-json');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts an unanswered request after ten seconds and clears its timer', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    );
    const rejected = expect(
      service.createCheckoutSession(input),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline after successful requests', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(Response.json(payload()));
    await service.createCheckoutSession(input);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects missing configuration before making a provider request', async () => {
    vi.stubEnv('PAYMONGO_SECRET_KEY', '');
    service = new PayMongoService();
    await expect(service.createCheckoutSession(input)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['production', 'test'],
    ['test', 'live'],
  ])('refuses HTTP in %s / %s mode', async (nodeEnv, mode) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('PAYMONGO_MODE', mode);
    vi.stubEnv('PAYMONGO_API_URL', 'http://localhost:3009');
    service = new PayMongoService();
    await expect(service.createCheckoutSession(input)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds a real HTTP response whose body never finishes', async () => {
    fetchMock.mockImplementation(nativeFetch);
    let closeResponse: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      closeResponse = resolve;
    });
    const server = createServer((_request, response) => {
      response.on('close', closeResponse);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"data":');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing test listener');
      vi.stubEnv('PAYMONGO_API_URL', `http://127.0.0.1:${address.port}`);
      service = new PayMongoService();
      await expect(service.createCheckoutSession(input)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      await closed;
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 15_000);
});
