import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../database/prisma.service.js';
import { PaymentService } from '../payment/payment.service.js';
import { StoreService } from '../store/store.service.js';
import { CartService } from './cart.service.js';

const customerId = 'customer-1';
const cartId = 'cart-1';
const coffeeId = 'coffee-1';
const itemId = 'item-1';
const orderId = 'order-1';
const fixedDate = new Date('2026-10-01T10:00:00.000Z');

function makeCoffee(overrides: Record<string, unknown> = {}) {
  return {
    id: coffeeId,
    name: 'Caffeinawa Latte',
    description: 'Espresso with steamed milk',
    category: 'latte',
    price: new Prisma.Decimal('125.50'),
    available: true,
    imageUrl: null,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    ...overrides,
  };
}

function makeCart(items: Array<Record<string, unknown>> = []) {
  return {
    id: cartId,
    customerId,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    items,
  };
}

function makeCartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    cartId,
    coffeeId,
    quantity: 2,
    coffee: makeCoffee(),
    ...overrides,
  };
}

function makeOrder() {
  return {
    id: orderId,
    customerId,
    status: OrderStatus.PENDING,
    total: new Prisma.Decimal('251.00'),
    createdAt: fixedDate,
    items: [
      {
        id: 'order-item-1',
        orderId,
        coffeeId,
        quantity: 2,
        unitPrice: new Prisma.Decimal('125.50'),
      },
    ],
  };
}

function createHarness() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),

    customer: { findUnique: vi.fn() },
    cart: { findUnique: vi.fn() },
    order: { create: vi.fn() },
    payment: { create: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
  };

  const prisma = {
    customer: { findUnique: vi.fn() },
    cart: { upsert: vi.fn() },
    coffee: { findUnique: vi.fn() },
    cartItem: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const paymentService = {
    createCashPayment: vi.fn(),
    createPayMongoPayment: vi.fn(),
  };

  const storeService = {
    assertAcceptingOrders: vi.fn().mockResolvedValue(undefined),
  };

  const service = new CartService(
    prisma as unknown as PrismaService,
    paymentService as unknown as PaymentService,
    storeService as unknown as StoreService,
  );

  return { service, prisma, paymentService, storeService, tx };
}

describe('CartService', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    vi.stubEnv('PAYMONGO_ENABLED', 'true');
    harness = createHarness();

    harness.prisma.customer.findUnique.mockResolvedValue({
      id: customerId,
    });

    harness.prisma.cart.upsert.mockResolvedValue(makeCart());

    harness.tx.customer.findUnique.mockResolvedValue({
      id: customerId,
    });

    harness.tx.cart.findUnique.mockResolvedValue(makeCart([makeCartItem()]));

    harness.tx.order.create.mockResolvedValue(makeOrder());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('findOne', () => {
    it('returns cart items with calculated subtotals and total', async () => {
      harness.prisma.cart.upsert.mockResolvedValue(makeCart([makeCartItem()]));

      const result = await harness.service.findOne(customerId);

      expect(result).toMatchObject({
        id: cartId,
        customerId,
        total: 251,
        items: [
          {
            id: itemId,
            coffeeId,
            quantity: 2,
            subtotal: 251,
            coffee: {
              name: 'Caffeinawa Latte',
              price: 125.5,
              available: true,
            },
          },
        ],
      });

      expect(harness.prisma.cart.upsert).toHaveBeenCalledWith({
        where: { customerId },
        create: { customerId },
        update: {},
        include: {
          items: { include: { coffee: true } },
        },
      });
    });

    it('returns an empty cart with zero total', async () => {
      const result = await harness.service.findOne(customerId);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('rejects a missing customer', async () => {
      harness.prisma.customer.findUnique.mockResolvedValue(null);

      await expect(harness.service.findOne(customerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(harness.prisma.cart.upsert).not.toHaveBeenCalled();
    });

    it('calculates fractional subtotals and totals with Decimal arithmetic', async () => {
      harness.prisma.cart.upsert.mockResolvedValue(
        makeCart([
          makeCartItem({
            quantity: 3,
            coffee: makeCoffee({
              price: new Prisma.Decimal('0.10'),
            }),
          }),
        ]),
      );

      const result = await harness.service.findOne(customerId);

      expect(result.items[0]?.subtotal).toBe(0.3);
      expect(result.total).toBe(0.3);
    });
  });

  describe('addItem', () => {
    it('adds an available coffee with the requested quantity', async () => {
      harness.prisma.coffee.findUnique.mockResolvedValue(makeCoffee());

      await harness.service.addItem(customerId, {
        coffeeId,
        quantity: 2,
      });

      expect(harness.prisma.cartItem.upsert).toHaveBeenCalledWith({
        where: {
          cartId_coffeeId: { cartId, coffeeId },
        },
        create: {
          cartId,
          coffeeId,
          quantity: 2,
        },
        update: {
          quantity: { increment: 2 },
        },
      });
    });

    it('rejects a coffee that does not exist', async () => {
      harness.prisma.coffee.findUnique.mockResolvedValue(null);

      await expect(
        harness.service.addItem(customerId, {
          coffeeId,
          quantity: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('rejects unavailable coffee', async () => {
      harness.prisma.coffee.findUnique.mockResolvedValue(
        makeCoffee({ available: false }),
      );

      await expect(
        harness.service.addItem(customerId, {
          coffeeId,
          quantity: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(harness.prisma.cartItem.upsert).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('updates an item belonging to the cart', async () => {
      harness.prisma.cartItem.findFirst.mockResolvedValue(makeCartItem());

      await harness.service.updateItem(customerId, itemId, {
        quantity: 3,
      });

      expect(harness.prisma.cartItem.findFirst).toHaveBeenCalledWith({
        where: { id: itemId, cartId },
      });

      expect(harness.prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { quantity: 3 },
      });
    });

    it('rejects an item outside the customer cart', async () => {
      harness.prisma.cartItem.findFirst.mockResolvedValue(null);

      await expect(
        harness.service.updateItem(customerId, itemId, {
          quantity: 3,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.prisma.cartItem.update).not.toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    it('removes an item belonging to the cart', async () => {
      harness.prisma.cartItem.findFirst.mockResolvedValue(makeCartItem());

      await harness.service.removeItem(customerId, itemId);

      expect(harness.prisma.cartItem.findFirst).toHaveBeenCalledWith({
        where: { id: itemId, cartId },
      });

      expect(harness.prisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: itemId },
      });
    });

    it('rejects removal of another cart item', async () => {
      harness.prisma.cartItem.findFirst.mockResolvedValue(null);

      await expect(
        harness.service.removeItem(customerId, itemId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(harness.prisma.cartItem.delete).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('deletes only items from the customer cart', async () => {
      const result = await harness.service.clear(customerId);

      expect(harness.prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId },
      });

      expect(result).toMatchObject({
        id: cartId,
        customerId,
        items: [],
        total: 0,
      });
    });
  });

  describe('checkout', () => {
    it('rejects checkout for a missing customer', async () => {
      harness.tx.customer.findUnique.mockResolvedValue(null);

      await expect(harness.service.checkout(customerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(harness.tx.order.create).not.toHaveBeenCalled();
      expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects an empty cart', async () => {
      harness.tx.cart.findUnique.mockResolvedValue(makeCart());

      await expect(harness.service.checkout(customerId)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(harness.tx.order.create).not.toHaveBeenCalled();
      expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects checkout when the cart does not exist', async () => {
      harness.tx.cart.findUnique.mockResolvedValue(null);

      await expect(harness.service.checkout(customerId)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(harness.tx.order.create).not.toHaveBeenCalled();
    });

    it('rejects unavailable coffee before creating an order', async () => {
      harness.tx.cart.findUnique.mockResolvedValue(
        makeCart([
          makeCartItem({
            coffee: makeCoffee({ available: false }),
          }),
        ]),
      );

      await expect(harness.service.checkout(customerId)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(harness.tx.order.create).not.toHaveBeenCalled();
      expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('calculates checkout total from current server-side prices', async () => {
      const result = await harness.service.checkout(customerId);

      expect(harness.tx.order.create).toHaveBeenCalledOnce();

      const args = harness.tx.order.create.mock.calls[0]?.[0];

      expect(args).toMatchObject({
        data: {
          customerId,
          items: {
            create: [
              {
                coffeeId,
                quantity: 2,
                unitPrice: new Prisma.Decimal('125.50'),
              },
            ],
          },
        },
        include: { items: true },
      });

      expect(args.data.total.toString()).toBe('251');
      expect(result).toMatchObject({
        id: orderId,
        customerId,
        status: 'pending',
        total: 251,
      });
    });

    it('creates a pending cash payment during checkout', async () => {
      await harness.service.checkout(customerId, 'cash');

      expect(harness.paymentService.createCashPayment).toHaveBeenCalledOnce();

      const [transaction, createdOrderId, amount] =
        harness.paymentService.createCashPayment.mock.calls[0];

      expect(transaction).toBe(harness.tx);
      expect(createdOrderId).toBe(orderId);
      expect(amount.toString()).toBe('251');

      expect(harness.tx.payment.create).not.toHaveBeenCalled();
      expect(harness.tx.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId },
      });
    });

    it('creates a pending PayMongo payment and checkout session', async () => {
      const payment = {
        id: 'payment-1',
        orderId,
        provider: 'paymongo' as const,
        status: 'pending' as const,
        amount: 251,
        currency: 'PHP',
        createdAt: fixedDate.toISOString(),
        updatedAt: fixedDate.toISOString(),
      };

      harness.paymentService.createPayMongoPayment.mockResolvedValue({
        payment,
        checkoutUrl: 'https://checkout.example.com/session',
      });

      const result = await harness.service.checkout(customerId, 'paymongo');

      expect(harness.tx.payment.create).toHaveBeenCalledWith({
        data: {
          orderId,
          provider: PaymentProvider.PAYMONGO,
          amount: new Prisma.Decimal('251'),
          currency: 'PHP',
          status: PaymentStatus.PENDING,
        },
      });

      expect(harness.paymentService.createPayMongoPayment).toHaveBeenCalledWith(
        orderId,
      );

      expect(result).toMatchObject({
        order: {
          id: orderId,
          total: 251,
        },
        payment,
        checkoutUrl: 'https://checkout.example.com/session',
      });
    });

    it('does not clear the cart when order creation fails', async () => {
      harness.tx.order.create.mockRejectedValue(
        new Error('Database insert failed'),
      );

      await expect(harness.service.checkout(customerId)).rejects.toThrow(
        'Database insert failed',
      );

      expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(harness.paymentService.createCashPayment).not.toHaveBeenCalled();
    });

    it('does not clear the cart when cash payment creation fails', async () => {
      harness.paymentService.createCashPayment.mockRejectedValue(
        new Error('Payment insert failed'),
      );

      await expect(
        harness.service.checkout(customerId, 'cash'),
      ).rejects.toThrow('Payment insert failed');

      expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('does not call PayMongo when the database transaction fails', async () => {
      harness.tx.payment.create.mockRejectedValue(
        new Error('Pending payment insert failed'),
      );

      await expect(
        harness.service.checkout(customerId, 'paymongo'),
      ).rejects.toThrow('Pending payment insert failed');

      expect(
        harness.paymentService.createPayMongoPayment,
      ).not.toHaveBeenCalled();

      expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('calls PayMongo only after the checkout transaction completes', async () => {
      let transactionFinished = false;

      harness.prisma.$transaction.mockImplementationOnce(
        async (
          callback: (transaction: typeof harness.tx) => Promise<unknown>,
        ) => {
          const result = await callback(harness.tx);
          transactionFinished = true;
          return result;
        },
      );

      harness.paymentService.createPayMongoPayment.mockImplementation(
        async () => {
          expect(transactionFinished).toBe(true);

          return {
            payment: {
              id: 'payment-1',
              orderId,
              provider: 'paymongo',
              status: 'pending',
              amount: 251,
              currency: 'PHP',
              createdAt: fixedDate.toISOString(),
              updatedAt: fixedDate.toISOString(),
            },
            checkoutUrl: 'https://checkout.example.com/session',
          };
        },
      );

      await harness.service.checkout(customerId, 'paymongo');

      expect(transactionFinished).toBe(true);
    });

    it.each(['cash', 'paymongo'] as const)(
      'rejects %s checkout while ordering is closed',
      async (provider) => {
        harness.storeService.assertAcceptingOrders.mockRejectedValueOnce(
          new ConflictException('Ordering is closed'),
        );

        await expect(
          harness.service.checkout(customerId, provider),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(harness.storeService.assertAcceptingOrders).toHaveBeenCalledWith(
          harness.tx,
        );

        expect(harness.tx.order.create).not.toHaveBeenCalled();
        expect(harness.tx.payment.create).not.toHaveBeenCalled();
        expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();

        expect(harness.paymentService.createCashPayment).not.toHaveBeenCalled();

        expect(
          harness.paymentService.createPayMongoPayment,
        ).not.toHaveBeenCalled();
      },
    );

    it('locks the customer cart before reading its items', async () => {
      harness.tx.$queryRaw.mockImplementationOnce(async () => {
        expect(harness.tx.cart.findUnique).not.toHaveBeenCalled();
        expect(harness.tx.order.create).not.toHaveBeenCalled();

        return [];
      });

      await harness.service.checkout(customerId, 'cash');

      expect(harness.tx.$queryRaw).toHaveBeenCalledOnce();

      const [strings, lockedCustomerId] = harness.tx.$queryRaw.mock.calls[0];

      expect(strings.join('')).toContain('FROM "Cart"');
      expect(strings.join('')).toContain('FOR UPDATE');
      expect(lockedCustomerId).toBe(customerId);

      expect(harness.tx.order.create).toHaveBeenCalledOnce();
    });

    it('returns the committed order reference when PayMongo checkout fails', async () => {
      harness.paymentService.createPayMongoPayment.mockRejectedValueOnce(
        new Error('Private provider error details'),
      );

      const error = await harness.service
        .checkout(customerId, 'paymongo')
        .catch((cause: unknown) => cause);

      expect(error).toMatchObject({
        response: {
          statusCode: 502,
          code: 'PAYMENT_CHECKOUT_UNAVAILABLE',
          orderId,
        },
      });

      expect(JSON.stringify(error)).not.toContain(
        'Private provider error details',
      );

      expect(harness.tx.order.create).toHaveBeenCalledOnce();
      expect(harness.tx.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId },
      });

      expect(
        harness.paymentService.createPayMongoPayment,
      ).toHaveBeenCalledExactlyOnceWith(orderId);
    });

    it('rejects disabled PayMongo before creating an order or clearing the cart', async () => {
      vi.stubEnv('PAYMONGO_ENABLED', 'false');

      await expect(
        harness.service.checkout(customerId, 'paymongo'),
      ).rejects.toThrow(
        'PayMongo checkout is currently unavailable. Please choose cash.',
      );

      expect(harness.prisma.$transaction).not.toHaveBeenCalled();
      expect(harness.tx.order.create).not.toHaveBeenCalled();
      expect(harness.tx.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(
        harness.paymentService.createPayMongoPayment,
      ).not.toHaveBeenCalled();
    });

    it('allows cash checkout when PayMongo is disabled', async () => {
      vi.stubEnv('PAYMONGO_ENABLED', 'false');

      await harness.service.checkout(customerId, 'cash');

      expect(harness.tx.order.create).toHaveBeenCalledOnce();
      expect(harness.paymentService.createCashPayment).toHaveBeenCalledOnce();
    });
  });
});
