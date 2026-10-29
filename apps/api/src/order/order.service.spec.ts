import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { OrderService } from './order.service.js';

const customerId = 'customer-1';
const anotherCustomerId = 'customer-2';
const orderId = 'order-1';
const coffeeId = 'coffee-1';
const fixedDate = new Date('2026-10-01T10:00:00.000Z');

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    customerId,
    status: OrderStatus.PENDING,
    total: new Prisma.Decimal('250.00'),
    createdAt: fixedDate,
    items: [
      {
        id: 'item-1',
        orderId,
        coffeeId,
        quantity: 2,
        unitPrice: new Prisma.Decimal('125.00'),
      },
    ],
    ...overrides,
  };
}

function makeAdminOrder(overrides: Record<string, unknown> = {}) {
  return {
    ...makeOrder(),
    customer: {
      id: customerId,
      name: 'Test Customer',
      email: 'customer@example.com',
    },
    ...overrides,
  };
}

function createHarness() {
  const prisma = {
    customer: {
      findUnique: vi.fn(),
    },
    coffee: {
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    payment: {
      findFirst: vi.fn(),
    },
  };

  prisma.$transaction.mockImplementation(
    async (callback: (transaction: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
  );

  const service = new OrderService(prisma as unknown as PrismaService);

  return { service, prisma };
}

describe('OrderService', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  describe('findAllByCustomer', () => {
    it('returns only the customer’s orders', async () => {
      harness.prisma.order.findMany.mockResolvedValue([makeOrder()]);

      const result = await harness.service.findAllByCustomer(customerId);

      expect(harness.prisma.order.findMany).toHaveBeenCalledWith({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });

      expect(result).toMatchObject([
        {
          id: orderId,
          customerId,
          status: 'pending',
          total: 250,
          items: [
            {
              id: 'item-1',
              coffeeId,
              quantity: 2,
              unitPrice: 125,
            },
          ],
        },
      ]);
    });

    it('returns an empty array when the customer has no orders', async () => {
      harness.prisma.order.findMany.mockResolvedValue([]);

      await expect(
        harness.service.findAllByCustomer(customerId),
      ).resolves.toEqual([]);
    });
  });

  describe('findOneByCustomer', () => {
    it('returns an order belonging to the customer', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(makeOrder());

      const result = await harness.service.findOneByCustomer(
        orderId,
        customerId,
      );

      expect(harness.prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: orderId, customerId },
        include: { items: true },
      });

      expect(result).toMatchObject({
        id: orderId,
        customerId,
        total: 250,
      });
    });

    it('throws NotFoundException when the order does not belong to the customer', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        harness.service.findOneByCustomer(orderId, anotherCustomerId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the order does not exist', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        harness.service.findOneByCustomer('missing-order', customerId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns an admin order with customer information', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(makeAdminOrder());

      const result = await harness.service.findOne(orderId);

      expect(harness.prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: orderId },
        include: {
          items: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      expect(result).toMatchObject({
        id: orderId,
        customer: {
          id: customerId,
          name: 'Test Customer',
          email: 'customer@example.com',
        },
      });
    });

    it('throws NotFoundException when the admin requests a missing order', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        harness.service.findOne('missing-order'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('advances a confirmed order to preparing', async () => {
      harness.prisma.order.findUnique
        .mockResolvedValueOnce(
          makeAdminOrder({ status: OrderStatus.CONFIRMED }),
        )
        .mockResolvedValueOnce(
          makeAdminOrder({ status: OrderStatus.PREPARING }),
        );

      harness.prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await harness.service.update(orderId, {
        status: 'preparing',
      });

      expect(result.status).toBe('preparing');

      expect(harness.prisma.order.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          id: orderId,
          status: OrderStatus.CONFIRMED,
        },
        data: {
          status: OrderStatus.PREPARING,
        },
      });

      expect(harness.prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('requires a paid payment before confirming an order', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(makeAdminOrder());
      harness.prisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        harness.service.update(orderId, { status: 'confirmed' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(harness.prisma.payment.findFirst).toHaveBeenCalledWith({
        where: {
          orderId,
          status: PaymentStatus.PAID,
        },
        select: { id: true },
      });

      expect(harness.prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('allows confirmation when payment is already paid', async () => {
      harness.prisma.order.findUnique
        .mockResolvedValueOnce(makeAdminOrder())
        .mockResolvedValueOnce(
          makeAdminOrder({ status: OrderStatus.CONFIRMED }),
        );

      harness.prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
      });

      harness.prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await harness.service.update(orderId, {
        status: 'confirmed',
      });

      expect(result.status).toBe('confirmed');
    });

    it.each([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ])('returns repeated %s status without writing', async (status) => {
      harness.prisma.order.findUnique.mockResolvedValue(
        makeAdminOrder({ status }),
      );

      const result = await harness.service.update(orderId, {
        status: status.toLowerCase() as Parameters<
          OrderService['update']
        >[1]['status'],
      });

      expect(result.status).toBe(status.toLowerCase());
      expect(harness.prisma.order.updateMany).not.toHaveBeenCalled();
      expect(harness.prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it.each([
      {
        current: OrderStatus.COMPLETED,
        next: 'pending' as const,
      },
      {
        current: OrderStatus.CANCELLED,
        next: 'confirmed' as const,
      },
      {
        current: OrderStatus.PENDING,
        next: 'completed' as const,
      },
      {
        current: OrderStatus.PREPARING,
        next: 'confirmed' as const,
      },
      {
        current: OrderStatus.READY,
        next: 'cancelled' as const,
      },
    ])('rejects $current to $next', async ({ current, next }) => {
      harness.prisma.order.findUnique.mockResolvedValue(
        makeAdminOrder({ status: current }),
      );

      await expect(
        harness.service.update(orderId, { status: next }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(harness.prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
    ])(
      'allows cancellation from %s without changing payments',
      async (status) => {
        harness.prisma.order.findUnique
          .mockResolvedValueOnce(makeAdminOrder({ status }))
          .mockResolvedValueOnce(
            makeAdminOrder({ status: OrderStatus.CANCELLED }),
          );

        harness.prisma.order.updateMany.mockResolvedValue({ count: 1 });

        const result = await harness.service.update(orderId, {
          status: 'cancelled',
        });

        expect(result.status).toBe('cancelled');
        expect(harness.prisma.payment.findFirst).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        current: OrderStatus.PREPARING,
        next: 'ready' as const,
        expected: OrderStatus.READY,
      },
      {
        current: OrderStatus.READY,
        next: 'completed' as const,
        expected: OrderStatus.COMPLETED,
      },
    ])('allows $current to $next', async ({ current, next, expected }) => {
      harness.prisma.order.findUnique
        .mockResolvedValueOnce(makeAdminOrder({ status: current }))
        .mockResolvedValueOnce(makeAdminOrder({ status: expected }));

      harness.prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await harness.service.update(orderId, {
        status: next,
      });

      expect(result.status).toBe(next);
    });

    it('rejects a concurrent change instead of overwriting it', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(
        makeAdminOrder({ status: OrderStatus.CONFIRMED }),
      );

      harness.prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        harness.service.update(orderId, { status: 'preparing' }),
      ).rejects.toThrow(
        'Order status changed while updating. Refresh and try again.',
      );

      expect(harness.prisma.order.findUnique).toHaveBeenCalledOnce();
    });

    it('returns 404 for a missing order', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        harness.service.update(orderId, { status: 'confirmed' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.prisma.order.updateMany).not.toHaveBeenCalled();
    });
  });
});
