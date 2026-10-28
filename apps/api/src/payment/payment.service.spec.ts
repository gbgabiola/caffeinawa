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
import { PayMongoService } from './paymongo.service.js';
import { PaymentService } from './payment.service.js';

const paymentId = 'payment-1';
const orderId = 'order-1';
const fixedDate = new Date('2026-10-01T10:00:00.000Z');

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: paymentId,
    orderId,
    provider: PaymentProvider.CASH,
    checkoutSessionId: null,
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

function makeAdminPayment(
  overrides: Partial<Payment> = {},
  orderStatus: OrderStatus = OrderStatus.PENDING,
) {
  return {
    ...makePayment(overrides),
    order: {
      id: orderId,
      status: orderStatus,
      customer: {
        id: 'customer-1',
        name: 'Test Customer',
        email: 'customer@example.com',
      },
      items: [
        {
          coffee: { name: 'Caffeinawa Latte' },
          quantity: 2,
          unitPrice: new Prisma.Decimal('125.00'),
        },
      ],
    },
  };
}

function makePaidPayment() {
  return makeAdminPayment({
    status: PaymentStatus.PAID,
    paidAt: fixedDate,
  });
}

function createHarness() {
  const tx = {
    payment: {
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
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const service = new PaymentService(
    prisma as unknown as PrismaService,
    {} as PayMongoService,
  );

  return { service, prisma, tx };
}

describe('PaymentService.markCashPaymentAsPaid', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();

    harness.tx.payment.findUnique
      .mockResolvedValueOnce(makeAdminPayment())
      .mockResolvedValue(makePaidPayment());

    harness.tx.payment.updateMany.mockResolvedValue({ count: 1 });
    harness.tx.order.updateMany.mockResolvedValue({ count: 1 });
  });

  it('conditionally settles cash and confirms a pending order', async () => {
    const result = await harness.service.markCashPaymentAsPaid(paymentId);

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();

    expect(harness.tx.payment.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: paymentId,
        provider: PaymentProvider.CASH,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.PAID,
        paidAt: expect.any(Date),
      },
    });

    expect(harness.tx.order.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: orderId,
        status: OrderStatus.PENDING,
      },
      data: {
        status: OrderStatus.CONFIRMED,
      },
    });

    expect(result).toMatchObject({
      id: paymentId,
      provider: 'cash',
      status: 'paid',
      amount: 250,
      paidAt: fixedDate.toISOString(),
      order: {
        customer: {
          id: 'customer-1',
          name: 'Test Customer',
          email: 'customer@example.com',
        },
        items: [
          {
            coffeeName: 'Caffeinawa Latte',
            quantity: 2,
            unitPrice: 125,
          },
        ],
      },
    });
  });

  it('rejects a missing payment', async () => {
    harness.tx.payment.findUnique.mockReset().mockResolvedValue(null);

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects manual settlement of PayMongo payments', async () => {
    harness.tx.payment.findUnique
      .mockReset()
      .mockResolvedValue(
        makeAdminPayment({ provider: PaymentProvider.PAYMONGO }),
      );

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
    PaymentStatus.CANCELLED,
  ])('rejects settlement from %s', async (status) => {
    harness.tx.payment.findUnique
      .mockReset()
      .mockResolvedValue(makeAdminPayment({ status }));

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('returns an already-paid payment without changing its timestamp or order', async () => {
    harness.tx.payment.findUnique
      .mockReset()
      .mockResolvedValue(
        makeAdminPayment(
          { status: PaymentStatus.PAID, paidAt: fixedDate },
          OrderStatus.CANCELLED,
        ),
      );

    const result = await harness.service.markCashPaymentAsPaid(paymentId);

    expect(result.paidAt).toBe(fixedDate.toISOString());
    expect(harness.tx.payment.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.order.findUnique).not.toHaveBeenCalled();
  });

  it('returns the winning settlement after losing a concurrent claim', async () => {
    harness.tx.payment.updateMany.mockResolvedValue({ count: 0 });

    const result = await harness.service.markCashPaymentAsPaid(paymentId);

    expect(result.status).toBe('paid');
    expect(result.paidAt).toBe(fixedDate.toISOString());

    expect(harness.tx.payment.updateMany).toHaveBeenCalledOnce();
    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent change to a non-payable status', async () => {
    harness.tx.payment.updateMany.mockResolvedValue({ count: 0 });
    harness.tx.payment.findUnique
      .mockReset()
      .mockResolvedValueOnce(makeAdminPayment())
      .mockResolvedValueOnce(
        makeAdminPayment({ status: PaymentStatus.FAILED }),
      );

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a payment that disappears before the claim completes', async () => {
    harness.tx.payment.updateMany.mockResolvedValue({ count: 0 });
    harness.tx.payment.findUnique
      .mockReset()
      .mockResolvedValueOnce(makeAdminPayment())
      .mockResolvedValueOnce(null);

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
  ])('preserves an order already at %s', async (status) => {
    harness.tx.order.updateMany.mockResolvedValue({ count: 0 });
    harness.tx.order.findUnique.mockResolvedValue({
      id: orderId,
      status,
    });

    const result = await harness.service.markCashPaymentAsPaid(paymentId);

    expect(result.status).toBe('paid');

    expect(harness.tx.order.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: orderId,
        status: OrderStatus.PENDING,
      },
      data: {
        status: OrderStatus.CONFIRMED,
      },
    });
  });

  it('throws inside the transaction when the order is cancelled', async () => {
    harness.tx.order.updateMany.mockResolvedValue({ count: 0 });
    harness.tx.order.findUnique.mockResolvedValue({
      id: orderId,
      status: OrderStatus.CANCELLED,
    });

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toThrow(
      'Cannot settle cash payment for an order with status "CANCELLED"',
    );

    // Real rollback is verified by the database E2E test.
    expect(harness.tx.payment.findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing order', async () => {
    harness.tx.order.updateMany.mockResolvedValue({ count: 0 });
    harness.tx.order.findUnique.mockResolvedValue(null);

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates unexpected database errors', async () => {
    const error = new Error('Database unavailable');
    harness.tx.order.updateMany.mockRejectedValue(error);

    await expect(harness.service.markCashPaymentAsPaid(paymentId)).rejects.toBe(
      error,
    );
  });
});
