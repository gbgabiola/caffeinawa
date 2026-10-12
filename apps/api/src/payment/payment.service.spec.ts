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

type TransactionMock = {
  payment: {
    findUnique: ReturnType<typeof vi.fn>;
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

function makeAdminPaymentRecord(payment: Payment) {
  return {
    ...payment,
    order: {
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

function createHarness() {
  const tx: TransactionMock = {
    payment: {
      findUnique: vi.fn(),
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

describe('PaymentService.markCashPaymentAsPaid', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it('marks a pending cash payment as paid and confirms its order', async () => {
    const pendingPayment = makePayment();
    const paidPayment = makePayment({
      status: PaymentStatus.PAID,
      paidAt: fixedDate,
      updatedAt: fixedDate,
    });

    harness.tx.payment.findUnique
      .mockResolvedValueOnce(pendingPayment)
      .mockResolvedValueOnce(makeAdminPaymentRecord(paidPayment));
    harness.tx.payment.update.mockResolvedValueOnce(paidPayment);

    const result = await harness.service.markCashPaymentAsPaid(paymentId);

    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.tx.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        paidAt: expect.any(Date),
      },
    });
    expect(harness.tx.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: OrderStatus.CONFIRMED },
    });
    expect(result).toMatchObject({
      id: paymentId,
      orderId,
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

  it('throws NotFoundException when the payment does not exist', async () => {
    harness.tx.payment.findUnique.mockResolvedValueOnce(null);

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('rejects manually marking a PayMongo payment as paid', async () => {
    harness.tx.payment.findUnique.mockResolvedValueOnce(
      makePayment({ provider: PaymentProvider.PAYMONGO }),
    );

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('rejects a cash payment that is not pending', async () => {
    harness.tx.payment.findUnique.mockResolvedValueOnce(
      makePayment({ status: PaymentStatus.FAILED }),
    );

    await expect(
      harness.service.markCashPaymentAsPaid(paymentId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
  });

  it('returns an already-paid cash payment without updating it again', async () => {
    const paidPayment = makePayment({
      status: PaymentStatus.PAID,
      paidAt: fixedDate,
      updatedAt: fixedDate,
    });
    harness.tx.payment.findUnique
      .mockResolvedValueOnce(paidPayment)
      .mockResolvedValueOnce(makeAdminPaymentRecord(paidPayment));

    const result = await harness.service.markCashPaymentAsPaid(paymentId);

    expect(harness.tx.payment.findUnique).toHaveBeenCalledTimes(2);
    expect(harness.tx.payment.update).not.toHaveBeenCalled();
    expect(harness.tx.order.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: paymentId,
      provider: 'cash',
      status: 'paid',
      paidAt: fixedDate.toISOString(),
    });
  });
});
