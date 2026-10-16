import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { PayMongoService } from './paymongo.service.js';
import { PaymentService } from './payment.service.js';

const fixedDate = new Date('2026-10-01T10:00:00.000Z');

function makePayment(
  options: {
    id?: string;
    status?: PaymentStatus;
    orderStatus?: OrderStatus;
  } = {},
) {
  return {
    id: options.id ?? 'payment-1',
    orderId: 'order-1',
    provider: PaymentProvider.PAYMONGO,
    checkoutSessionId: 'cs_test_123',
    paymentIntentId: null,
    providerEventId: null,
    amount: new Prisma.Decimal('250.00'),
    currency: 'PHP',
    status: options.status ?? PaymentStatus.PENDING,
    paidAt: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    order: {
      id: 'order-1',
      status: options.orderStatus ?? OrderStatus.PENDING,
      customer: {
        id: 'customer-1',
        name: 'Test Customer',
        email: 'customer@example.com',
      },
      items: [
        {
          coffee: {
            name: 'Caffeinawa Latte',
          },
          quantity: 2,
          unitPrice: new Prisma.Decimal('125.00'),
        },
      ],
    },
  };
}

function createHarness() {
  const prisma = {
    payment: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const service = new PaymentService(
    prisma as unknown as PrismaService,
    {} as PayMongoService,
  );

  return {
    service,
    prisma,
  };
}

describe('PaymentService.findReconciliationCandidates', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();

    harness.prisma.payment.count.mockResolvedValue(0);
    harness.prisma.payment.findMany.mockResolvedValue([]);
  });

  it('filters stale pending payments and paid cancelled orders', async () => {
    harness.prisma.payment.count.mockResolvedValue(2);

    harness.prisma.payment.findMany.mockResolvedValue([
      makePayment({
        id: 'payment-pending',
      }),
      makePayment({
        id: 'payment-cancelled',
        status: PaymentStatus.PAID,
        orderStatus: OrderStatus.CANCELLED,
      }),
    ]);

    const result = await harness.service.findReconciliationCandidates({
      page: 1,
      pageSize: 10,
      ageHours: 24,
    });

    expect(harness.prisma.payment.count).toHaveBeenCalledOnce();

    const countArgs = harness.prisma.payment.count.mock.calls[0]?.[0];

    expect(countArgs).toMatchObject({
      where: {
        OR: [
          {
            status: PaymentStatus.PENDING,
            createdAt: {
              lt: expect.any(Date),
            },
          },
          {
            status: PaymentStatus.PAID,
            order: {
              status: OrderStatus.CANCELLED,
            },
          },
        ],
      },
    });

    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
      totalPages: 1,
    });

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'payment-pending',
        status: 'pending',
        reconciliationReason: 'STALE_PENDING_PAYMENT',
      }),
      expect.objectContaining({
        id: 'payment-cancelled',
        status: 'paid',
        reconciliationReason: 'PAID_ORDER_CANCELLED',
      }),
    ]);

    expect(result.data[0]?.order).toMatchObject({
      customer: {
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
    });
  });

  it('returns an empty paginated response when there are no candidates', async () => {
    const result = await harness.service.findReconciliationCandidates({
      page: 1,
      pageSize: 10,
      ageHours: 24,
    });

    expect(result).toEqual({
      data: [],
      meta: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
      },
    });
  });

  it('normalizes a requested page beyond the available results', async () => {
    harness.prisma.payment.count.mockResolvedValue(3);

    await harness.service.findReconciliationCandidates({
      page: 99,
      pageSize: 2,
      ageHours: 48,
    });

    expect(harness.prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 2,
        take: 2,
      }),
    );
  });

  it('does not perform payment mutations', async () => {
    await harness.service.findReconciliationCandidates({
      page: 1,
      pageSize: 10,
      ageHours: 24,
    });

    expect(Object.keys(harness.prisma.payment)).toEqual(['count', 'findMany']);
  });
});
