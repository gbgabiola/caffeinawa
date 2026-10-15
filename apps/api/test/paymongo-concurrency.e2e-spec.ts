import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderStatus, PaymentProvider, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PaymentService } from '../src/payment/payment.service.js';

describe('PayMongo concurrent settlement (database e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let paymentService: PaymentService;

  let customerId: string | undefined;
  let orderId: string | undefined;

  const checkoutSessionId = `cs_test_${randomUUID()}`;

  const createEvent = (eventId: string) => ({
    id: eventId,
    type: 'event',
    attributes: {
      type: 'checkout_session.payment.paid',
      livemode: false,
      data: {
        id: checkoutSessionId,
        type: 'checkout_session',
        attributes: {
          reference_number: orderId,
          payment_intent: {
            id: 'pi_concurrency_test',
          },
        },
      },
    },
  });

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
        'PayMongo concurrency E2E tests require TEST_DATABASE_URL',
      );
    }

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    await app.init();

    prisma = app.get(PrismaService);
    paymentService = app.get(PaymentService);

    const customer = await prisma.customer.create({
      data: {
        name: 'PayMongo Concurrency Test Customer',
        email: `paymongo-concurrency-${randomUUID()}@example.com`,
      },
    });

    customerId = customer.id;

    const order = await prisma.order.create({
      data: {
        customerId,
        total: '250.00',
        status: OrderStatus.PENDING,
      },
    });

    orderId = order.id;

    await prisma.payment.create({
      data: {
        orderId,
        provider: PaymentProvider.PAYMONGO,
        checkoutSessionId,
        amount: '250.00',
        currency: 'PHP',
        status: PaymentStatus.PENDING,
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && orderId) {
        await prisma.payment.deleteMany({
          where: { orderId },
        });

        await prisma.order.deleteMany({
          where: { id: orderId },
        });
      }

      if (prisma && customerId) {
        await prisma.customer.deleteMany({
          where: { id: customerId },
        });
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('settles a PayMongo payment exactly once under concurrent delivery', async () => {
    if (!orderId) {
      throw new Error('Order fixture was not initialized');
    }

    const rawBody = Buffer.from('concurrent-webhook-test');

    const eventA = createEvent('evt_concurrent_a');
    const eventB = createEvent('evt_concurrent_b');

    // Deliver both events without awaiting either first.
    const results = await Promise.allSettled([
      paymentService.handlePayMongoPaymentPaid(eventA, rawBody),
      paymentService.handlePayMongoPaymentPaid(eventB, rawBody),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'fulfilled',
    ]);

    const payments = await prisma.payment.findMany({
      where: { orderId },
    });

    expect(payments).toHaveLength(1);

    const payment = payments[0]!;

    expect(payment.status).toBe(PaymentStatus.PAID);
    expect(payment.paidAt).toBeInstanceOf(Date);

    // The event ID must belong to one winning delivery.
    expect(['evt_concurrent_a', 'evt_concurrent_b']).toContain(
      payment.providerEventId,
    );

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    expect(order.status).toBe(OrderStatus.CONFIRMED);

    // Re-deliver the losing event after settlement.
    const originalPaidAt = payment.paidAt;
    const originalEventId = payment.providerEventId;

    await paymentService.handlePayMongoPaymentPaid(eventA, rawBody);

    await paymentService.handlePayMongoPaymentPaid(eventB, rawBody);

    const afterDuplicates = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    expect(afterDuplicates.status).toBe(PaymentStatus.PAID);

    expect(afterDuplicates.paidAt?.getTime()).toBe(originalPaidAt?.getTime());

    expect(afterDuplicates.providerEventId).toBe(originalEventId);
  }, 20_000);
});
