import { NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
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
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };

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
    it('updates the order status', async () => {
      const pendingOrder = makeOrder();
      const confirmedOrder = makeOrder({
        status: OrderStatus.CONFIRMED,
      });

      harness.prisma.order.findUnique.mockResolvedValue(
        makeAdminOrder(pendingOrder),
      );
      harness.prisma.order.update.mockResolvedValue(
        makeAdminOrder(confirmedOrder),
      );

      const result = await harness.service.update(orderId, {
        status: 'confirmed',
      });

      expect(harness.prisma.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
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
        status: 'confirmed',
      });
    });

    it('throws NotFoundException when the order does not exist', async () => {
      harness.prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        harness.service.update(orderId, {
          status: 'confirmed',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
