import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CartService } from '../src/cart/cart.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PayMongoService } from '../src/payment/paymongo.service.js';
import { PayMongoCheckoutService } from '../src/payment/paymongo-checkout.service.js';

describe('PayMongo recovery (isolated database, simulated provider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cart: CartService;
  let recovery: PayMongoCheckoutService;
  let customerId: string;
  let coffeeId: string;
  let token: string;
  let previousOpen: boolean;
  let loseResponse: boolean;
  let state: 'unpaid' | 'paid' | 'processing' | 'expired';
  const customers: string[] = [];
  const sessions = new Map<string, { id: string; body: string }>();
  const calls: Array<{ method: string; key?: string; body?: string }> = [];
  let duringRead: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (
      !url ||
      url !== process.env.TEST_DATABASE_URL ||
      !decodeURIComponent(new URL(url).pathname).toLowerCase().includes('test')
    )
      throw new Error('Exact test database URL required');
    vi.stubEnv(
      'PAYMONGO_SECRET_KEY',
      'synthetic-test-key-never-used-against-provider',
    );
    vi.stubEnv('PAYMONGO_MODE', 'test');
    vi.stubEnv('PAYMONGO_API_URL', 'https://api.paymongo.com');
    vi.stubEnv('WEB_URL', 'http://localhost:3000');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    cart = app.get(CartService);
    recovery = app.get(PayMongoCheckoutService);
    previousOpen = (
      await prisma.storeSettings.findUniqueOrThrow({ where: { id: 'main' } })
    ).acceptingOrders;
    coffeeId = (
      await prisma.coffee.create({
        data: {
          name: 'Recovery Latte',
          description: 'Test only',
          category: 'latte',
          price: '125.50',
        },
      })
    ).id;
  });

  beforeEach(async () => {
    vi.stubEnv('PAYMONGO_ENABLED', 'true');
    loseResponse = false;
    state = 'unpaid';
    duringRead = undefined;
    sessions.clear();
    calls.length = 0;
    customerId = (
      await prisma.customer.create({
        data: {
          name: 'Payment Recovery Customer',
          email: `${randomUUID()}@example.test`,
        },
      })
    ).id;
    customers.push(customerId);
    token = await app.get(JwtService).signAsync({
      sub: customerId,
      email: 'test@example.test',
      role: 'CUSTOMER',
    });
    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: true },
    });
    await cart.addItem(customerId, { coffeeId, quantity: 2 });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (options?.method === 'POST') {
          expect(path).toBe('/v2/checkout_sessions');
          const key = new Headers(options.headers).get('Idempotency-Key');
          if (!key) throw new Error('Missing provider idempotency key');
          const body = String(options.body);
          // A separate database read observes the committed attempt before HTTP.
          const persisted =
            await prisma.payMongoCheckoutAttempt.findUniqueOrThrow({
              where: { paymentId: key },
            });
          expect(persisted.requestBody).toBe(body);
          expect(await prisma.order.count({ where: { customerId } })).toBe(1);
          calls.push({ method: 'POST', key, body });
          const existing = sessions.get(key);
          if (existing) expect(existing.body).toBe(body);
          const session = existing ?? {
            id: `cs_${randomUUID().replaceAll('-', '')}`,
            body,
          };
          sessions.set(key, session);
          if (loseResponse) {
            loseResponse = false;
            throw new TypeError(
              'Simulated response lost after provider creation',
            );
          }
          return Response.json({
            data: {
              id: session.id,
              type: 'checkout_session',
              attributes: {
                checkout_url: `https://checkout.paymongo.com/${session.id}`,
                livemode: false,
              },
            },
          });
        }
        expect(options?.method).toBe('GET');
        const session = [...sessions.values()].find(
          (session) => path === `/v1/checkout_sessions/${session.id}`,
        );
        if (!session) throw new Error('Unexpected provider retrieval');
        calls.push({ method: 'GET' });
        if (duringRead) await duringRead();
        const original = JSON.parse(session.body).data.attributes;
        return Response.json({
          data: {
            id: session.id,
            type: 'checkout_session',
            attributes: {
              reference_number: original.reference_number,
              line_items: original.line_items,
              livemode: false,
              checkout_url: `https://checkout.paymongo.com/${session.id}`,
              status: state === 'expired' ? 'expired' : 'active',
              payment_intent: null,
              payments:
                state === 'paid' || state === 'processing'
                  ? [{ type: 'payment', attributes: { status: state } }]
                  : [],
            },
          },
        });
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.payment.deleteMany({
          where: { order: { customerId: { in: customers } } },
        });
        await prisma.order.deleteMany({
          where: { customerId: { in: customers } },
        });
        await prisma.customer.deleteMany({ where: { id: { in: customers } } });
        if (coffeeId) await prisma.coffee.delete({ where: { id: coffeeId } });
      }
    } finally {
      try {
        if (prisma && previousOpen !== undefined)
          await prisma.storeSettings.update({
            where: { id: 'main' },
            data: { acceptingOrders: previousOpen },
          });
      } finally {
        vi.unstubAllEnvs();
        if (app) await app.close();
      }
    }
  });

  async function checkout(lost = false) {
    loseResponse = lost;
    const current = await cart.findOne(customerId);
    try {
      const result = await cart.checkout(
        customerId,
        'paymongo',
        randomUUID(),
        current.revision,
      );
      return 'order' in result ? result.order.id : result.id;
    } catch (error) {
      if (!lost) throw error;
      expect(error).toMatchObject({
        response: { code: 'PAYMENT_CHECKOUT_UNAVAILABLE' },
      });
      return (error as { response: { orderId: string } }).response.orderId;
    }
  }
  const post = (orderId: string) =>
    request(app.getHttpServer())
      .post(`/api/orders/${orderId}/payment-checkout/resume`)
      .set('Authorization', `Bearer ${token}`);

  it('recovers an ambiguous creation with the same key/body after profile changes and a refilled cart', async () => {
    const orderId = await checkout(true);
    const refilled = await cart.addItem(customerId, { coffeeId, quantity: 3 });
    await prisma.customer.update({
      where: { id: customerId },
      data: { name: 'Changed profile' },
    });
    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: false },
    });
    expect((await recovery.status(customerId, orderId)).canResume).toBe(true);
    const result = await recovery.resume(customerId, orderId);
    expect(result.status).toBe('ready');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(sessions.size).toBe(1);
    expect(await cart.findOne(customerId)).toEqual(refilled);
    expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
    expect(await prisma.order.count({ where: { customerId } })).toBe(1);
  });

  it('recovers safely before the first external creation request after a checkout-process crash', async () => {
    const spy = vi
      .spyOn(app.get(PayMongoService), 'createCheckoutSession')
      .mockRejectedValueOnce(new Error('Simulated crash before HTTP'));
    const orderId = await checkout(true);
    expect(calls).toHaveLength(0);
    spy.mockRestore();
    loseResponse = false;
    expect((await recovery.resume(customerId, orderId)).status).toBe('ready');
    expect(sessions.size).toBe(1);
  });

  it('serializes concurrent recovery results to one persisted provider session', async () => {
    const orderId = await checkout(true);
    const results = await Promise.all([
      recovery.resume(customerId, orderId),
      recovery.resume(customerId, orderId),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(sessions.size).toBe(1);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId },
    });
    expect(payment.checkoutSessionId).toBe([...sessions.values()][0]!.id);
    expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
  });

  it('keeps a provider in-progress response ambiguous until the original call completes', async () => {
    const simulated = globalThis.fetch;
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let first = true;
    let conflicts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
        if (options?.method !== 'POST') return simulated(url, options);
        if (!first) {
          conflicts++;
          return new Response('', { status: 409 });
        }
        first = false;
        const response = await simulated(url, options);
        entered();
        await waiting;
        return response;
      }),
    );
    const original = checkout();
    try {
      await started;
      const order = await prisma.order.findFirstOrThrow({
        where: { customerId },
      });
      await expect(recovery.resume(customerId, order.id)).rejects.toMatchObject(
        { status: 502 },
      );
      expect(conflicts).toBe(1);
      expect(sessions.size).toBe(1);
    } finally {
      release();
    }
    const orderId = await original;
    expect((await recovery.resume(customerId, orderId)).status).toBe('ready');
    expect(sessions.size).toBe(1);
  });

  it('recovers when persisting the provider response fails after session creation', async () => {
    vi.spyOn(prisma.payment, 'updateMany').mockRejectedValueOnce(
      new Error('Simulated response persistence failure'),
    );
    const current = await cart.findOne(customerId);
    const error = await cart
      .checkout(customerId, 'paymongo', randomUUID(), current.revision)
      .catch((cause) => cause);
    expect(error).toMatchObject({
      response: { code: 'PAYMENT_CHECKOUT_UNAVAILABLE' },
    });
    const orderId = error.response.orderId as string;
    loseResponse = false;
    expect((await recovery.resume(customerId, orderId)).status).toBe('ready');
    expect(sessions.size).toBe(1);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(2);
  });

  it('retrieves a known session without another creation, including after the retry window', async () => {
    const orderId = await checkout();
    await prisma.payMongoCheckoutAttempt.updateMany({
      where: { payment: { orderId } },
      data: { createdAt: new Date(Date.now() - 25 * 3600000) },
    });
    expect((await recovery.resume(customerId, orderId)).status).toBe('ready');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('refuses ambiguous creation after the recovery window and after credential rotation', async () => {
    const orderId = await checkout(true);
    const expired = await prisma.payMongoCheckoutAttempt.findFirstOrThrow({
      where: { payment: { orderId } },
    });
    vi.stubEnv('PAYMONGO_SECRET_KEY', 'rotated-synthetic-key');
    const rotated = new PayMongoCheckoutService(prisma, new PayMongoService());
    await expect(rotated.resume(customerId, orderId)).rejects.toMatchObject({
      status: 409,
    });
    await prisma.payMongoCheckoutAttempt.update({
      where: { paymentId: expired.paymentId },
      data: { createdAt: new Date(Date.now() - 23 * 3600000) },
    });
    await expect(recovery.resume(customerId, orderId)).rejects.toMatchObject({
      status: 409,
    });
    expect((await recovery.status(customerId, orderId)).canResume).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('keeps legacy payments without a saved attempt in manual review', async () => {
    const orderId = await checkout(true);
    await prisma.payMongoCheckoutAttempt.deleteMany({
      where: { payment: { orderId } },
    });
    await expect(recovery.resume(customerId, orderId)).rejects.toMatchObject({
      status: 409,
    });
    expect((await recovery.status(customerId, orderId)).canResume).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it.each(['paid', 'processing', 'expired'] as const)(
    'does not return a payable URL for a provider session that is %s',
    async (providerState) => {
      const orderId = await checkout();
      state = providerState;
      const result = await recovery.resume(customerId, orderId);
      expect(result.status).toBe(
        providerState === 'expired' ? 'unavailable' : 'awaiting_confirmation',
      );
      expect(result).not.toHaveProperty('checkoutUrl');
      expect(
        (await prisma.payment.findFirstOrThrow({ where: { orderId } })).status,
      ).toBe('PENDING');
      expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    },
  );

  it.each(['PAID', 'CANCELLED'] as const)(
    'rechecks concurrent %s settlement/cancellation before returning a URL',
    async (state) => {
      const orderId = await checkout();
      duringRead = async () => {
        if (state === 'PAID')
          await prisma.payment.updateMany({
            where: { orderId },
            data: { status: 'PAID' },
          });
        else
          await prisma.order.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' },
          });
      };
      if (state === 'PAID')
        expect((await recovery.resume(customerId, orderId)).status).toBe(
          'awaiting_confirmation',
        );
      else
        await expect(
          recovery.resume(customerId, orderId),
        ).rejects.toMatchObject({ status: 409 });
    },
  );

  it('gates recovery while PayMongo is disabled without blocking unrelated cash checkout', async () => {
    const orderId = await checkout();
    vi.stubEnv('PAYMONGO_ENABLED', 'false');
    expect((await recovery.status(customerId, orderId)).canResume).toBe(false);
    await expect(recovery.resume(customerId, orderId)).rejects.toMatchObject({
      status: 503,
    });
    expect(calls).toHaveLength(1);
    const current = await cart.addItem(customerId, { coffeeId, quantity: 1 });
    await cart.checkout(customerId, 'cash', randomUUID(), current.revision);
    expect(await prisma.order.count({ where: { customerId } })).toBe(2);
  });

  it('enforces owner authentication and never returns private snapshots', async () => {
    const orderId = await checkout();
    const status = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}/payment-checkout`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(status.body.canResume).toBe(true);
    expect(status.headers['cache-control']).toBe('no-store');
    expect(Object.keys(status.body).sort()).toEqual(['canResume', 'message']);
    const other = await app.get(JwtService).signAsync({
      sub: randomUUID(),
      email: 'other@example.test',
      role: 'CUSTOMER',
    });
    await request(app.getHttpServer())
      .get(`/api/orders/${orderId}/payment-checkout`)
      .set('Authorization', `Bearer ${other}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/payment-checkout/resume`)
      .set('Authorization', `Bearer ${other}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/payment-checkout/resume`)
      .expect(401);
    const result = await post(orderId).expect(200);
    expect(result.body.status).toBe('ready');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('rolls back order/payment creation if saving the provider snapshot fails', async () => {
    vi.spyOn(
      app.get(PayMongoService),
      'prepareCheckoutSession',
    ).mockImplementationOnce(() => {
      throw new Error('Snapshot failure');
    });
    const current = await cart.findOne(customerId);
    await expect(
      cart.checkout(customerId, 'paymongo', randomUUID(), current.revision),
    ).rejects.toThrow('Snapshot failure');
    expect(await prisma.order.count({ where: { customerId } })).toBe(0);
    expect(
      await prisma.payment.count({ where: { order: { customerId } } }),
    ).toBe(0);
    expect(await cart.findOne(customerId)).toEqual(current);
    expect(calls).toHaveLength(0);
  });
});
