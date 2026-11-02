import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { CartService } from '../src/cart/cart.service.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Concurrent cart checkout (database e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cartService: CartService;

  let customerId: string | undefined;
  let coffeeId: string | undefined;
  let previousAcceptingOrders: boolean | undefined;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;

    if (
      !databaseUrl ||
      !testDatabaseUrl ||
      databaseUrl !== testDatabaseUrl ||
      !decodeURIComponent(new URL(databaseUrl).pathname.slice(1))
        .toLowerCase()
        .includes('test')
    ) {
      throw new Error(
        'Checkout concurrency E2E tests require TEST_DATABASE_URL',
      );
    }

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    cartService = app.get(CartService);

    const settings = await prisma.storeSettings.findUniqueOrThrow({
      where: { id: 'main' },
    });

    previousAcceptingOrders = settings.acceptingOrders;

    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: true },
    });

    const suffix = randomUUID();

    const customer = await prisma.customer.create({
      data: {
        name: 'Checkout Concurrency Customer',
        email: `checkout-concurrency-${suffix}@example.com`,
      },
    });

    customerId = customer.id;

    const coffee = await prisma.coffee.create({
      data: {
        name: `Concurrency Latte ${suffix}`,
        description: 'Coffee for checkout concurrency testing',
        category: 'latte',
        price: '125.50',
        available: true,
      },
    });

    coffeeId = coffee.id;

    await prisma.cart.create({
      data: {
        customerId,
        items: {
          create: {
            coffeeId,
            quantity: 2,
          },
        },
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && customerId) {
        await prisma.payment.deleteMany({
          where: {
            order: { customerId },
          },
        });

        // Order items are deleted by the order's cascade relation.
        await prisma.order.deleteMany({
          where: { customerId },
        });

        // Cart items are deleted by the cart's cascade relation.
        await prisma.cart.deleteMany({
          where: { customerId },
        });
      }

      if (prisma && coffeeId) {
        await prisma.coffee.deleteMany({
          where: { id: coffeeId },
        });
      }

      if (prisma && customerId) {
        await prisma.customer.deleteMany({
          where: { id: customerId },
        });
      }
    } finally {
      try {
        if (prisma && previousAcceptingOrders !== undefined) {
          await prisma.storeSettings.update({
            where: { id: 'main' },
            data: {
              acceptingOrders: previousAcceptingOrders,
            },
          });
        }
      } finally {
        if (app) {
          await app.close();
        }
      }
    }
  });

  async function resetCart(quantity = 2) {
    if (!customerId || !coffeeId) throw new Error('Missing fixtures');
    const cart = await prisma.cart.findUniqueOrThrow({ where: { customerId } });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.create({
      data: { cartId: cart.id, coffeeId, quantity },
    });
  }

  it('serializes simultaneous additions when the customer has no cart yet', async () => {
    if (!customerId || !coffeeId) throw new Error('Missing fixtures');
    await prisma.cart.deleteMany({ where: { customerId } });
    try {
      await Promise.all([
        cartService.addItem(customerId, { coffeeId, quantity: 48 }),
        cartService.addItem(customerId, { coffeeId, quantity: 51 }),
      ]);
      const cart = await cartService.findOne(customerId);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.quantity).toBe(99);
    } finally {
      await resetCart();
    }
  }, 20_000);

  it('serializes first additions and rejects an accumulated quantity above 99', async () => {
    if (!customerId || !coffeeId) throw new Error('Missing fixtures');
    const cart = await prisma.cart.findUniqueOrThrow({ where: { customerId } });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    try {
      await Promise.all([
        cartService.addItem(customerId, { coffeeId, quantity: 48 }),
        cartService.addItem(customerId, { coffeeId, quantity: 51 }),
      ]);
      await expect(
        cartService.addItem(customerId, { coffeeId, quantity: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const items = await prisma.cartItem.findMany({
        where: { cartId: cart.id },
      });
      expect(items).toHaveLength(1);
      expect(items[0]!.quantity).toBe(99);
    } finally {
      await resetCart();
    }
  }, 20_000);

  it('allows only one concurrent increment from 98 to 99', async () => {
    if (!customerId || !coffeeId) throw new Error('Missing fixtures');
    await resetCart(98);
    try {
      const results = await Promise.allSettled([
        cartService.addItem(customerId, { coffeeId, quantity: 1 }),
        cartService.addItem(customerId, { coffeeId, quantity: 1 }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const failed = results.find((result) => result.status === 'rejected');
      expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(
        BadRequestException,
      );
      const cart = await cartService.findOne(customerId);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]!.quantity).toBe(99);
    } finally {
      await resetCart();
    }
  }, 20_000);

  it('keeps a concurrent absolute update and addition within the limit', async () => {
    if (!customerId || !coffeeId) throw new Error('Missing fixtures');
    await resetCart(98);
    try {
      const cart = await cartService.findOne(customerId);
      const results = await Promise.allSettled([
        cartService.updateItem(customerId, cart.items[0]!.id, { quantity: 99 }),
        cartService.addItem(customerId, { coffeeId, quantity: 1 }),
      ]);
      expect(results[0]!.status).toBe('fulfilled');
      if (results[1]!.status === 'rejected') {
        expect(results[1]!.reason).toBeInstanceOf(BadRequestException);
      }
      expect((await cartService.findOne(customerId)).items[0]!.quantity).toBe(
        99,
      );
    } finally {
      await resetCart();
    }
  }, 20_000);

  it('rejects legacy over-limit checkout and permits explicit correction', async () => {
    if (!customerId) throw new Error('Missing fixtures');
    await resetCart(101);
    try {
      await expect(
        cartService.checkout(customerId, 'cash'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.order.count({ where: { customerId } })).toBe(0);
      const cart = await cartService.findOne(customerId);
      expect(cart.items[0]!.quantity).toBe(101);
      const corrected = await cartService.updateItem(
        customerId,
        cart.items[0]!.id,
        { quantity: 99 },
      );
      expect(corrected.items[0]!.quantity).toBe(99);
    } finally {
      await resetCart();
    }
  }, 20_000);

  it('preserves a concurrent addition either in the order or the remaining cart', async () => {
    if (!customerId || !coffeeId) throw new Error('Missing fixtures');
    await resetCart(1);
    try {
      const [order] = await Promise.all([
        cartService.checkout(customerId, 'cash'),
        cartService.addItem(customerId, { coffeeId, quantity: 2 }),
      ]);
      expect('items' in order).toBe(true);
      const orders = await prisma.order.findMany({
        where: { customerId },
        include: { items: true, payments: true },
      });
      const cart = await cartService.findOne(customerId);
      expect(orders).toHaveLength(1);
      const orderedQuantity = orders[0]!.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const remainingQuantity = cart.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      expect(orderedQuantity + remainingQuantity).toBe(3);
      expect(orders[0]!.total.toString()).toBe(
        new Prisma.Decimal('125.50').mul(orderedQuantity).toString(),
      );
      expect(orders[0]!.payments).toHaveLength(1);
      expect(orders[0]!.payments[0]!.amount.toString()).toBe(
        orders[0]!.total.toString(),
      );
    } finally {
      await prisma.payment.deleteMany({ where: { order: { customerId } } });
      await prisma.order.deleteMany({ where: { customerId } });
      await resetCart();
    }
  }, 20_000);

  it('creates one order and payment from simultaneous checkouts', async () => {
    if (!customerId || !coffeeId) {
      throw new Error('Checkout fixtures were not initialized');
    }

    const results = await Promise.allSettled([
      cartService.checkout(customerId, 'cash'),
      cartService.checkout(customerId, 'cash'),
    ]);

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = results.filter((result) => result.status === 'rejected');

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failedCheckout = rejected[0];

    if (!failedCheckout || failedCheckout.status !== 'rejected') {
      throw new Error('Expected one rejected checkout');
    }

    expect(failedCheckout.reason).toBeInstanceOf(BadRequestException);
    expect(failedCheckout.reason.message).toBe('Cart is empty');

    const orders = await prisma.order.findMany({
      where: { customerId },
      include: {
        items: true,
        payments: true,
      },
    });

    expect(orders).toHaveLength(1);

    const order = orders[0]!;

    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.total.toString()).toBe('251');

    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      coffeeId,
      quantity: 2,
    });

    expect(order.items[0]!.unitPrice.toString()).toBe('125.5');

    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]).toMatchObject({
      provider: PaymentProvider.CASH,
      status: PaymentStatus.PENDING,
    });

    expect(order.payments[0]!.amount.toString()).toBe('251');

    const cart = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
      include: { items: true },
    });

    expect(cart.items).toEqual([]);
  }, 20_000);
});
