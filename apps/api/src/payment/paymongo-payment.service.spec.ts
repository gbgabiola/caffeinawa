import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type { Payment } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { PaymentService } from './payment.service.js';
import { PayMongoService } from './paymongo.service.js';

const paymentId = 'payment-1';
const orderId = 'order-1';
const checkoutSessionId = 'cs_test_123';
const eventId = 'evt_test_123';
const fixedDate = new Date('2026-10-01T10:00:00.000Z');

type TransactionMock = {
  payment: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  order: {
    update: ReturnType<typeof vi.fn>;
  };
};

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: paymentId,
    orderId,
    provider: PaymentProvider.PAYMONGO,
    checkoutSessionId,
    paymentIntentId: null,
    providerEventId: null,
    amount: new Prisma.Decimal('250.00'),
    currency: 'PHP',
    status: PaymentStatus.PENDING,
    paidAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

function makePaidEvent(
  overrides: {
    id?: string;
    checkoutSessionId?: string;
    referenceNumber?: string;
    paymentIntentId?: string;
  } = {},
) {
  return {
    id: overrides.id ?? eventId,
    type: 'event',
    attributes: {
      type: 'checkout_session.payment.paid',
      livemode: false,
      data: {
        id: overrides.checkoutSessionId ?? checkoutSessionId,
        type: 'checkout_session',
        attributes: {
          reference_number: overrides.referenceNumber ?? orderId,
          payment_intent: {
            id: overrides.paymentIntentId ?? 'pi_test_123',
          },
        },
      },
    },
  };
}

function createHarness() {
  const tx: TransactionMock = {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    order: {
      update: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(
      async (callback: (transaction: TransactionMock) => Promise<unknown>) =>
        callback(tx),
    ),
  } as unknown as PrismaService;

  const payMongoService = {} as PayMongoService;
  const service = new PaymentService(prisma, payMongoService);

  return { service, prisma, tx };
}

describe('PaymentService.handlePayMongoPaymentPaid', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it('marks the payment as paid and confirms its order', async () => {
    const pendingPayment = makePayment();
    const paidPayment = makePayment({
      status: PaymentStatus.PAID,
      paymentIntentId: 'pi_test_123',
      providerEventId: eventId,
      paidAt: fixedDate,
      updatedAt: fixedDate,
    });

    harness.tx.payment.findFirst.mockResolvedValueOnce(pendingPayment);
    harness.tx.payment.update.mockResolvedValueOnce(paidPayment);

    await harness.service.handlePayMongoPaymentPaid(
      makePaidEvent(),
      Buffer.from('raw-webhook-body'),
    );

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();

    expect(harness.tx.payment.findFirst).toHaveBeenCalledWith({
      where: { checkoutSessionId },
    });

    expect(harness.tx.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        paymentIntentId: 'pi_test_123',
        providerEventId: eventId,
        paidAt: expect.any(Date),
      },
    });

    expect(harness.tx.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: OrderStatus.CONFIRMED },
    });
  });

  it('does not update payment or order for a duplicate event', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(
      makePayment({ providerEventId: eventId }),
    );

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).resolves.toBeUndefined();

    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('does not update an already-paid payment again', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(
      makePayment({
        status: PaymentStatus.PAID,
        providerEventId: 'evt_previous',
        paidAt: fixedDate,
      }),
    );

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).resolves.toBeUndefined();

    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('rejects a mismatched order reference', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(makePayment());

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent({ referenceNumber: 'another-order' }),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the checkout session has no payment', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(null);

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });
});
