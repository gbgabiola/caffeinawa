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
import { PaymentService } from '../src/payment/payment.service.js';

describe('Durable checkout requests (database e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: CartService;
  let customerId: string;
  let coffeeId: string;
  let token: string;
  let previousOpen: boolean;
  let key: string;
  let revision: number;
  const customers: string[] = [];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (
      !url ||
      url !== process.env.TEST_DATABASE_URL ||
      !decodeURIComponent(new URL(url).pathname).toLowerCase().includes('test')
    ) {
      throw new Error(
        'Checkout tests require exact TEST_DATABASE_URL equality and a test database',
      );
    }
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
    service = app.get(CartService);
    previousOpen = (
      await prisma.storeSettings.findUniqueOrThrow({ where: { id: 'main' } })
    ).acceptingOrders;
    coffeeId = (
      await prisma.coffee.create({
        data: {
          name: 'Idempotency Test Latte',
          description: 'Test only',
          category: 'latte',
          price: '125.50',
        },
      })
    ).id;
  });

  async function newCustomer() {
    const customer = await prisma.customer.create({
      data: { name: 'Checkout Test', email: `${randomUUID()}@example.test` },
    });
    customers.push(customer.id);
    return customer.id;
  }

  beforeEach(async () => {
    vi.stubEnv('PAYMONGO_ENABLED', 'true');
    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: true },
    });
    customerId = await newCustomer();
    token = await app
      .get(JwtService)
      .signAsync({
        sub: customerId,
        email: 'test@example.test',
        role: 'CUSTOMER',
      });
    const cart = await service.addItem(customerId, { coffeeId, quantity: 2 });
    revision = cart.revision;
    key = randomUUID();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
        if (app) await app.close();
      }
    }
  });

  const orderId = (result: Awaited<ReturnType<CartService['checkout']>>) =>
    'order' in result ? result.order.id : result.id;
  const body = () => ({
    idempotencyKey: key,
    cartRevision: revision,
    paymentProvider: 'cash',
  });
  const post = (path = 'checkout') =>
    request(app.getHttpServer())
      .post(`/api/customers/${customerId}/cart/${path}`)
      .set('Authorization', `Bearer ${token}`);

  it('commits one order/payment for simultaneous identical requests', async () => {
    const results = await Promise.all([
      service.checkout(customerId, 'cash', key, revision),
      service.checkout(customerId, 'cash', key, revision),
    ]);
    expect(orderId(results[0]!)).toBe(orderId(results[1]!));
    expect(
      results.filter((result) => 'checkoutReplayed' in result),
    ).toHaveLength(1);
    expect(await prisma.order.count({ where: { customerId } })).toBe(1);
    expect(
      await prisma.payment.count({ where: { order: { customerId } } }),
    ).toBe(1);
    expect((await service.findOne(customerId)).revision).toBe(revision + 1);
  });

  it('replays the original order after refill and store closure without touching the new cart', async () => {
    const original = await service.checkout(customerId, 'cash', key, revision);
    const refilled = await service.addItem(customerId, {
      coffeeId,
      quantity: 3,
    });
    await prisma.order.update({
      where: { id: orderId(original) },
      data: { status: 'CANCELLED' },
    });
    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: false },
    });
    const replay = await service.checkout(customerId, 'cash', key, revision);
    expect(replay).toMatchObject({
      checkoutReplayed: true,
      order: { id: orderId(original), status: 'cancelled' },
    });
    expect(await service.findOne(customerId)).toEqual(refilled);
    expect(await prisma.order.count({ where: { customerId } })).toBe(1);
  });

  it('binds keys to payment method and revision', async () => {
    await service.checkout(customerId, 'cash', key, revision);
    for (const [provider, requestedRevision] of [
      ['paymongo', revision],
      ['cash', revision + 1],
    ] as const) {
      await expect(
        service.checkout(customerId, provider, key, requestedRevision),
      ).rejects.toMatchObject({ response: { code: 'CHECKOUT_KEY_REUSED' } });
      await expect(
        service.recoverCheckout(customerId, provider, key, requestedRevision),
      ).rejects.toMatchObject({ response: { code: 'CHECKOUT_KEY_REUSED' } });
    }
    expect(await prisma.order.count({ where: { customerId } })).toBe(1);
  });

  it('scopes a key to the authenticated customer', async () => {
    const other = await newCustomer();
    const cart = await service.addItem(other, { coffeeId, quantity: 1 });
    const first = await service.checkout(customerId, 'cash', key, revision);
    const second = await service.checkout(other, 'cash', key, cart.revision);
    expect(orderId(first)).not.toBe(orderId(second));
  });

  it('closes an unused request before a delayed checkout can arrive, including while closed', async () => {
    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: false },
    });
    expect(
      await service.recoverCheckout(customerId, 'cash', key, revision),
    ).toEqual({ checkoutNotCreated: true });
    expect(
      await service.recoverCheckout(customerId, 'cash', key, revision),
    ).toEqual({ checkoutNotCreated: true });
    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: true },
    });
    await expect(
      service.checkout(customerId, 'cash', key, revision),
    ).rejects.toMatchObject({ response: { code: 'CHECKOUT_REQUEST_CLOSED' } });
    expect(await prisma.order.count({ where: { customerId } })).toBe(0);
    expect((await service.findOne(customerId)).items[0]!.quantity).toBe(2);
    await service.checkout(customerId, 'cash', randomUUID(), revision);
    expect(await prisma.order.count({ where: { customerId } })).toBe(1);
  });

  it('serializes recovery racing with checkout without cancelling a committed order', async () => {
    const [checkout, recovery] = await Promise.allSettled([
      service.checkout(customerId, 'cash', key, revision),
      service.recoverCheckout(customerId, 'cash', key, revision),
    ]);
    expect(recovery.status).toBe('fulfilled');
    if (recovery.status !== 'fulfilled') throw new Error('Recovery failed');
    if (checkout.status === 'fulfilled') {
      expect(recovery.value).toMatchObject({
        checkoutReplayed: true,
        order: { id: orderId(checkout.value), status: 'pending' },
      });
      expect(await prisma.order.count({ where: { customerId } })).toBe(1);
    } else {
      expect(checkout.reason.response.code).toBe('CHECKOUT_REQUEST_CLOSED');
      expect(recovery.value).toEqual({ checkoutNotCreated: true });
      expect(await prisma.order.count({ where: { customerId } })).toBe(0);
    }
  });

  it('rejects stale revisions and rolls back the reservation and cart changes', async () => {
    const changed = await service.addItem(customerId, {
      coffeeId,
      quantity: 1,
    });
    await expect(
      service.checkout(customerId, 'cash', key, revision),
    ).rejects.toMatchObject({ response: { code: 'CART_CHANGED' } });
    expect(await service.findOne(customerId)).toEqual(changed);
    expect(await prisma.checkoutRequest.count({ where: { customerId } })).toBe(
      0,
    );
    expect(
      await service.recoverCheckout(customerId, 'cash', key, revision),
    ).toEqual({ checkoutNotCreated: true });
  });

  it('rolls back a failed payment insert with the order and key', async () => {
    vi.spyOn(
      app.get(PaymentService),
      'createCashPayment',
    ).mockRejectedValueOnce(new Error('Test failure'));
    await expect(
      service.checkout(customerId, 'cash', key, revision),
    ).rejects.toThrow('Test failure');
    expect(await prisma.checkoutRequest.count({ where: { customerId } })).toBe(
      0,
    );
    expect(await prisma.order.count({ where: { customerId } })).toBe(0);
    expect((await service.findOne(customerId)).revision).toBe(revision);
  });

  it('never calls PayMongo again during concurrent replay or recovery, even with its first call pending', async () => {
    let release!: () => void;
    let entered!: () => void;
    const called = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider = vi
      .spyOn(app.get(PaymentService), 'createPayMongoPayment')
      .mockImplementation(async () => {
        entered();
        await waiting;
        throw new Error('Simulated ambiguous timeout');
      });
    const first = service
      .checkout(customerId, 'paymongo', key, revision)
      .catch((error) => error);
    try {
      await called;
      vi.stubEnv('PAYMONGO_ENABLED', 'false');
      const replay = await service.checkout(
        customerId,
        'paymongo',
        key,
        revision,
      );
      const recovered = await service.recoverCheckout(
        customerId,
        'paymongo',
        key,
        revision,
      );
      expect(recovered).toEqual(replay);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(
        await prisma.payment.count({ where: { order: { customerId } } }),
      ).toBe(1);
    } finally {
      release();
    }
    expect(await first).toMatchObject({
      response: { code: 'PAYMENT_CHECKOUT_UNAVAILABLE' },
    });
  });

  it('increments revisions for all successful mutations, including clear on an empty cart', async () => {
    let cart = await service.findOne(customerId);
    cart = await service.updateItem(customerId, cart.items[0]!.id, {
      quantity: 1,
    });
    expect(cart.revision).toBe(revision + 1);
    cart = await service.removeItem(customerId, cart.items[0]!.id);
    expect(cart.revision).toBe(revision + 2);
    cart = await service.clear(customerId);
    expect(cart.revision).toBe(revision + 3);
  });

  it('returns 201 for creation and 200 for a replay, with authenticated recovery', async () => {
    const created = await post().send(body()).expect(201);
    const replay = await post().send(body()).expect(200);
    expect(replay.body).toMatchObject({
      checkoutReplayed: true,
      order: { id: created.body.id },
    });
    const recovered = await post('checkout/recover').send(body()).expect(200);
    expect(recovered.body).toEqual(replay.body);
    await request(app.getHttpServer())
      .post(`/api/customers/${customerId}/cart/checkout/recover`)
      .send(body())
      .expect(401);
    const other = await newCustomer();
    await request(app.getHttpServer())
      .post(`/api/customers/${other}/cart/checkout/recover`)
      .set('Authorization', `Bearer ${token}`)
      .send(body())
      .expect(403);
  });

  it.each([
    { paymentProvider: 'cash' },
    { idempotencyKey: 'invalid', cartRevision: 1 },
    { idempotencyKey: randomUUID(), cartRevision: -1 },
    { idempotencyKey: randomUUID(), cartRevision: 1.5 },
    { idempotencyKey: randomUUID(), cartRevision: 2147483648 },
  ])('rejects unsafe checkout and recovery input %j', async (input) => {
    await post().send(input).expect(400);
    await post('checkout/recover').send(input).expect(400);
    expect(await prisma.order.count({ where: { customerId } })).toBe(0);
  });
});
