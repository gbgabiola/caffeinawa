import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentProvider, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Cash checkout and payment flow (database e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let customerId: string | undefined;
  let coffeeId: string | undefined;
  let orderId: string | undefined;

  let customerToken: string;
  let adminToken: string;
  let previousAcceptingOrders: boolean | undefined;

  beforeAll(async () => {
    // -------------------------------------------------------
    // 1. Validate test database configuration
    // -------------------------------------------------------
    const databaseUrl = process.env.DATABASE_URL;
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;

    if (!databaseUrl || !testDatabaseUrl) {
      throw new Error(
        'Both DATABASE_URL and TEST_DATABASE_URL must be configured',
      );
    }

    const databaseName = decodeURIComponent(
      new URL(databaseUrl).pathname.slice(1),
    );

    if (
      !databaseName.toLowerCase().includes('test') ||
      databaseUrl !== testDatabaseUrl
    ) {
      throw new Error('Database E2E tests must run against TEST_DATABASE_URL');
    }

    // -------------------------------------------------------
    // 2. Initialize the NestJS application
    // -------------------------------------------------------
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

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

    const previousSettings = await prisma.storeSettings.findUniqueOrThrow({
      where: { id: 'main' },
    });

    previousAcceptingOrders = previousSettings.acceptingOrders;

    await prisma.storeSettings.update({
      where: { id: 'main' },
      data: { acceptingOrders: false },
    });

    // -------------------------------------------------------
    // 3. Create isolated test fixtures
    // -------------------------------------------------------
    const jwtService = app.get(JwtService);
    const suffix = randomUUID();

    const customer = await prisma.customer.create({
      data: {
        name: 'Payment Flow E2E Customer',
        email: `payment-flow-${suffix}@example.com`,
      },
    });

    customerId = customer.id;

    const coffee = await prisma.coffee.create({
      data: {
        name: `Payment Flow Latte ${suffix}`,
        description:
          'Coffee created exclusively for payment integration testing',
        category: 'latte',
        price: '125.50',
        available: true,
      },
    });

    coffeeId = coffee.id;

    // -------------------------------------------------------
    // 4. Generate authentication tokens
    // -------------------------------------------------------
    customerToken = await jwtService.signAsync({
      sub: customer.id,
      email: customer.email,
      role: 'CUSTOMER',
    });

    adminToken = await jwtService.signAsync({
      sub: 'payment-flow-e2e-admin',
      email: 'payment-flow-admin@example.com',
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    try {
      if (!prisma) {
        return;
      }

      // -----------------------------------------------------
      // 1. Delete payments and order items before the order
      // -----------------------------------------------------
      if (orderId) {
        await prisma.payment.deleteMany({
          where: {
            orderId,
          },
        });

        await prisma.orderItem.deleteMany({
          where: {
            orderId,
          },
        });

        await prisma.order.deleteMany({
          where: {
            id: orderId,
          },
        });
      }

      // -----------------------------------------------------
      // 2. Delete cart items and cart
      // -----------------------------------------------------
      if (customerId) {
        await prisma.cartItem.deleteMany({
          where: {
            cart: {
              customerId,
            },
          },
        });

        await prisma.cart.deleteMany({
          where: {
            customerId,
          },
        });
      }

      // -----------------------------------------------------
      // 3. Delete the test coffee
      // -----------------------------------------------------

      if (coffeeId) {
        await prisma.coffee.deleteMany({
          where: {
            id: coffeeId,
          },
        });
      }

      // -----------------------------------------------------
      // 4. Delete the test customer
      // -----------------------------------------------------

      if (customerId) {
        await prisma.customer.deleteMany({
          where: {
            id: customerId,
          },
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

  it('persists checkout, cash settlement, idempotency, and provider restrictions', async () => {
    if (!customerId || !coffeeId) {
      throw new Error('Test fixtures were not initialized');
    }

    // -------------------------------------------------------
    // STEP 1: Customer adds coffee to the cart
    // -------------------------------------------------------
    const addItemResponse = await request(app.getHttpServer())
      .post(`/api/customers/${customerId}/cart/items`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        coffeeId,
        quantity: 2,
      })
      .expect(201);

    expect(addItemResponse.body).toMatchObject({
      customerId,
      total: 251,
      items: [
        {
          coffeeId,
          quantity: 2,
          subtotal: 251,
        },
      ],
    });

    await request(app.getHttpServer())
      .get('/api/store/ordering')
      .expect(200)
      .expect(({ body }) => {
        expect(body.acceptingOrders).toBe(false);
      });

    await request(app.getHttpServer())
      .patch('/api/admin/store/ordering')
      .send({ acceptingOrders: true })
      .expect(401);

    await request(app.getHttpServer())
      .patch('/api/admin/store/ordering')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ acceptingOrders: true })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/api/admin/store/ordering')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ acceptingOrders: 'true' })
      .expect(400);

    for (const paymentProvider of ['cash', 'paymongo']) {
      await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/cart/checkout`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ paymentProvider })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe('ORDERING_CLOSED');
        });
    }

    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        items: [{ coffeeId, quantity: 1 }],
      })
      .expect(404);

    expect(await prisma.order.count({ where: { customerId } })).toBe(0);

    const preservedCart = await prisma.cart.findUniqueOrThrow({
      where: { customerId },
      include: { items: true },
    });

    expect(preservedCart.items).toHaveLength(1);
    expect(preservedCart.items[0]?.quantity).toBe(2);

    await request(app.getHttpServer())
      .patch('/api/admin/store/ordering')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ acceptingOrders: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.acceptingOrders).toBe(true);
      });

    // -------------------------------------------------------
    // STEP 2: Customer checks out using cash
    // -------------------------------------------------------
    const checkoutResponse = await request(app.getHttpServer())
      .post(`/api/customers/${customerId}/cart/checkout`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        paymentProvider: 'cash',
      })
      .expect(201);

    expect(checkoutResponse.body).toMatchObject({
      customerId,
      status: 'pending',
      total: 251,
    });

    orderId = checkoutResponse.body.id as string;

    // -------------------------------------------------------
    // STEP 3: Verify persisted order and payment
    // -------------------------------------------------------
    const persistedOrder = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        items: true,
        payments: true,
      },
    });

    expect(persistedOrder).not.toBeNull();

    expect(persistedOrder?.status).toBe(OrderStatus.PENDING);

    expect(persistedOrder?.total.toNumber()).toBe(251);

    expect(persistedOrder?.items).toHaveLength(1);

    expect(persistedOrder?.items[0]).toMatchObject({
      coffeeId,
      quantity: 2,
    });

    expect(persistedOrder?.items[0]?.unitPrice.toNumber()).toBe(125.5);

    expect(persistedOrder?.payments).toHaveLength(1);

    const cashPayment = persistedOrder!.payments[0]!;

    expect(cashPayment).toMatchObject({
      orderId,
      provider: PaymentProvider.CASH,
      status: PaymentStatus.PENDING,
      currency: 'PHP',
      paidAt: null,
    });

    expect(cashPayment.amount.toNumber()).toBe(251);

    // -------------------------------------------------------
    // STEP 4: Verify checkout cleared the cart
    // -------------------------------------------------------
    const cartResponse = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/cart`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(cartResponse.body).toMatchObject({
      customerId,
      items: [],
      total: 0,
    });

    // -------------------------------------------------------
    // STEP 5: Customer cannot manually settle payment
    // -------------------------------------------------------
    await request(app.getHttpServer())
      .patch(`/api/admin/payments/${cashPayment.id}/mark-paid`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    const beforeSettlement = await prisma.payment.findUniqueOrThrow({
      where: {
        id: cashPayment.id,
      },
    });

    expect(beforeSettlement.status).toBe(PaymentStatus.PENDING);

    // -------------------------------------------------------
    // STEP 6: Administrator settles the cash payment
    // -------------------------------------------------------
    await request(app.getHttpServer())
      .patch('/api/admin/store/ordering')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ acceptingOrders: false })
      .expect(200);

    const settleResponse = await request(app.getHttpServer())
      .patch(`/api/admin/payments/${cashPayment.id}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(settleResponse.body).toMatchObject({
      id: cashPayment.id,
      orderId,
      provider: 'cash',
      status: 'paid',
      amount: 251,
    });

    expect(settleResponse.body.paidAt).toEqual(expect.any(String));

    // -------------------------------------------------------
    // STEP 7: Verify payment and order database updates
    // -------------------------------------------------------
    const settledPayment = await prisma.payment.findUniqueOrThrow({
      where: {
        id: cashPayment.id,
      },
    });

    const confirmedOrder = await prisma.order.findUniqueOrThrow({
      where: {
        id: orderId,
      },
    });

    expect(settledPayment.status).toBe(PaymentStatus.PAID);

    expect(settledPayment.paidAt).toBeInstanceOf(Date);

    expect(confirmedOrder.status).toBe(OrderStatus.CONFIRMED);

    const firstPaidAt = settledPayment.paidAt;

    // -------------------------------------------------------
    // STEP 8: Repeated settlement must be idempotent
    // -------------------------------------------------------
    const repeatResponse = await request(app.getHttpServer())
      .patch(`/api/admin/payments/${cashPayment.id}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(repeatResponse.body.status).toBe('paid');

    const paymentAfterRepeat = await prisma.payment.findUniqueOrThrow({
      where: {
        id: cashPayment.id,
      },
    });

    expect(paymentAfterRepeat.paidAt?.getTime()).toBe(firstPaidAt?.getTime());

    // -------------------------------------------------------
    // STEP 9: PayMongo payments cannot be marked manually
    // -------------------------------------------------------

    // Create a pending PayMongo payment directly in
    // PostgreSQL. This avoids external PayMongo API calls.

    const payMongoPayment = await prisma.payment.create({
      data: {
        orderId,
        provider: PaymentProvider.PAYMONGO,
        amount: '251.00',
        currency: 'PHP',
        status: PaymentStatus.PENDING,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/admin/payments/${payMongoPayment.id}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const persistedPayMongoPayment = await prisma.payment.findUniqueOrThrow({
      where: {
        id: payMongoPayment.id,
      },
    });

    expect(persistedPayMongoPayment.status).toBe(PaymentStatus.PENDING);

    expect(persistedPayMongoPayment.paidAt).toBeNull();
  });

  it('rolls back cash settlement for a cancelled order', async () => {
    if (!customerId) {
      throw new Error('Customer fixture was not initialized');
    }

    const order = await prisma.order.create({
      data: {
        customerId,
        total: '250.00',
        status: OrderStatus.CANCELLED,
      },
    });

    try {
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: PaymentProvider.CASH,
          amount: '250.00',
          status: PaymentStatus.PENDING,
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/admin/payments/${payment.id}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      const persistedPayment = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      const persistedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });

      expect(persistedPayment.status).toBe(PaymentStatus.PENDING);
      expect(persistedPayment.paidAt).toBeNull();
      expect(persistedOrder.status).toBe(OrderStatus.CANCELLED);
    } finally {
      await prisma.payment.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }
  });

  it.each([
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
  ])('settles cash without moving a %s order backward', async (status) => {
    if (!customerId) {
      throw new Error('Customer fixture was not initialized');
    }

    const order = await prisma.order.create({
      data: {
        customerId,
        total: '250.00',
        status,
      },
    });

    try {
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: PaymentProvider.CASH,
          amount: '250.00',
          status: PaymentStatus.PENDING,
        },
      });

      await request(app.getHttpServer())
        .patch(`/api/admin/payments/${payment.id}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const persistedPayment = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      const persistedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });

      expect(persistedPayment.status).toBe(PaymentStatus.PAID);
      expect(persistedPayment.paidAt).toBeInstanceOf(Date);
      expect(persistedOrder.status).toBe(status);
    } finally {
      await prisma.payment.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }
  });

  it('handles concurrent cash settlement without replacing paidAt', async () => {
    if (!customerId) {
      throw new Error('Customer fixture was not initialized');
    }

    const order = await prisma.order.create({
      data: {
        customerId,
        total: '250.00',
        status: OrderStatus.PENDING,
      },
    });

    try {
      const payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: PaymentProvider.CASH,
          amount: '250.00',
          status: PaymentStatus.PENDING,
        },
      });

      const settle = () =>
        request(app.getHttpServer())
          .patch(`/api/admin/payments/${payment.id}/mark-paid`)
          .set('Authorization', `Bearer ${adminToken}`);

      // Wait for both requests to finish before assertions or cleanup.
      const results = await Promise.allSettled([settle(), settle()]);

      const paidAtValues: string[] = [];

      for (const result of results) {
        if (result.status === 'rejected') {
          throw result.reason;
        }

        expect(result.value.status).toBe(200);
        expect(result.value.body.status).toBe('paid');
        expect(result.value.body.paidAt).toEqual(expect.any(String));

        paidAtValues.push(result.value.body.paidAt);
      }

      expect(paidAtValues[0]).toBe(paidAtValues[1]);

      const persistedPayment = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      const persistedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });

      expect(persistedPayment.status).toBe(PaymentStatus.PAID);
      expect(persistedPayment.paidAt?.toISOString()).toBe(paidAtValues[0]);
      expect(persistedOrder.status).toBe(OrderStatus.CONFIRMED);

      const repeat = await settle().expect(200);

      expect(repeat.body.paidAt).toBe(paidAtValues[0]);

      const afterRepeat = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });

      expect(afterRepeat.paidAt?.toISOString()).toBe(paidAtValues[0]);
    } finally {
      await prisma.payment.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }
  }, 20_000);
});
