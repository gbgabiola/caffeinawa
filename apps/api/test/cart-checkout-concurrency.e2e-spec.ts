import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderStatus, PaymentProvider, PaymentStatus } from '@prisma/client';
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
