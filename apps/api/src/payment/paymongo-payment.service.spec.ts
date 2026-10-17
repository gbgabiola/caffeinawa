import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentIssueReason,
  PaymentIssueStatus,
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
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  order: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
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
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(
      async (callback: (transaction: TransactionMock) => Promise<unknown>) =>
        callback(tx),
    ),
    paymentReconciliationIssue: {
      upsert: vi.fn().mockResolvedValue({
        id: 'issue-1',
      }),
    },
  } as unknown as PrismaService;

  const service = new PaymentService(prisma, {} as PayMongoService);

  return {
    service,
    prisma,
    tx,
  };
}

describe('PaymentService.handlePayMongoPaymentPaid', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();

    harness.tx.payment.findFirst.mockResolvedValue(makePayment());

    harness.tx.payment.updateMany.mockResolvedValue({
      count: 1,
    });

    harness.tx.order.updateMany.mockResolvedValue({
      count: 1,
    });
  });

  it('atomically marks payment paid and confirms its order', async () => {
    await harness.service.handlePayMongoPaymentPaid(
      makePaidEvent(),
      Buffer.from('raw-webhook-body'),
    );

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();

    expect(harness.tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: paymentId,
        provider: PaymentProvider.PAYMONGO,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.PAID,
        paymentIntentId: 'pi_test_123',
        providerEventId: eventId,
        paidAt: expect.any(Date),
      },
    });

    expect(harness.tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: orderId,
        status: OrderStatus.PENDING,
      },
      data: {
        status: OrderStatus.CONFIRMED,
      },
    });
  });

  it('ignores a duplicate event for an already-paid payment', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(
      makePayment({
        status: PaymentStatus.PAID,
        providerEventId: eventId,
        paidAt: fixedDate,
      }),
    );

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).resolves.toBeUndefined();

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();

    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('ignores an already-paid payment even when event IDs differ', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(
      makePayment({
        status: PaymentStatus.PAID,
        providerEventId: 'evt_previous',
        paidAt: fixedDate,
      }),
    );

    await harness.service.handlePayMongoPaymentPaid(
      makePaidEvent({
        id: 'evt_another_delivery',
      }),
      Buffer.from('raw-webhook-body'),
    );

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('treats a lost concurrent update as idempotent when the payment is now paid', async () => {
    harness.tx.payment.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    harness.tx.payment.findUnique.mockResolvedValueOnce(
      makePayment({
        status: PaymentStatus.PAID,
        providerEventId: 'evt_winning_delivery',
        paidAt: fixedDate,
      }),
    );

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).resolves.toBeUndefined();

    expect(harness.tx.payment.findUnique).toHaveBeenCalledWith({
      where: {
        id: paymentId,
      },
    });

    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent status change to FAILED', async () => {
    harness.tx.payment.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    harness.tx.payment.findUnique.mockResolvedValueOnce(
      makePayment({
        status: PaymentStatus.FAILED,
      }),
    );

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
    PaymentStatus.CANCELLED,
  ])('rejects settlement from %s status', async (status) => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(makePayment({ status }));

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a mismatched order reference', async () => {
    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent({
          referenceNumber: 'another-order',
        }),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-PayMongo payment', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(
      makePayment({
        provider: PaymentProvider.CASH,
      }),
    );

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when no payment matches the checkout session', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(null);

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it('preserves an order that has already progressed to PREPARING', async () => {
    harness.tx.order.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: orderId,
      status: OrderStatus.PREPARING,
    });

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).resolves.toBeUndefined();

    expect(harness.tx.order.findUnique).toHaveBeenCalledWith({
      where: {
        id: orderId,
      },
    });
  });

  it('rejects settlement of a cancelled order', async () => {
    harness.tx.order.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: orderId,
      status: OrderStatus.CANCELLED,
    });

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an order that no longer exists', async () => {
    harness.tx.order.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    harness.tx.order.findUnique.mockResolvedValueOnce(null);

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a rejected cancelled-order settlement outside the transaction', async () => {
    harness.tx.order.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    harness.tx.order.findUnique.mockResolvedValueOnce({
      id: orderId,
      status: OrderStatus.CANCELLED,
    });

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      harness.prisma.paymentReconciliationIssue.upsert,
    ).toHaveBeenCalledWith({
      where: {
        providerEventId: eventId,
      },
      create: {
        providerEventId: eventId,
        checkoutSessionId,
        paymentId,
        orderId,
        reason: PaymentIssueReason.INVALID_ORDER_STATUS,
        status: PaymentIssueStatus.OPEN,
      },
      update: {},
    });
  });

  it('records a missing payment without requiring a payment ID', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(null);

    await expect(
      harness.service.handlePayMongoPaymentPaid(
        makePaidEvent(),
        Buffer.from('raw-webhook-body'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      harness.prisma.paymentReconciliationIssue.upsert,
    ).toHaveBeenCalledWith({
      where: {
        providerEventId: eventId,
      },
      create: {
        providerEventId: eventId,
        checkoutSessionId,
        paymentId: undefined,
        orderId: undefined,
        reason: PaymentIssueReason.PAYMENT_NOT_FOUND,
        status: PaymentIssueStatus.OPEN,
      },
      update: {},
    });
  });

  it('does not audit a successful settlement', async () => {
    await harness.service.handlePayMongoPaymentPaid(
      makePaidEvent(),
      Buffer.from('raw-webhook-body'),
    );

    expect(
      harness.prisma.paymentReconciliationIssue.upsert,
    ).not.toHaveBeenCalled();
  });

  it('does not audit an already-paid duplicate', async () => {
    harness.tx.payment.findFirst.mockResolvedValueOnce(
      makePayment({
        status: PaymentStatus.PAID,
        providerEventId: eventId,
      }),
    );

    await harness.service.handlePayMongoPaymentPaid(
      makePaidEvent(),
      Buffer.from('raw-webhook-body'),
    );

    expect(
      harness.prisma.paymentReconciliationIssue.upsert,
    ).not.toHaveBeenCalled();
  });
});
