import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutRequestStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { MAX_CART_ITEM_QUANTITY } from '@caffeinawa/types';
import type {
  Cart,
  CartItem,
  Order,
  OrderStatus,
  CheckoutReplayResult,
  CheckoutRecoveryResult,
} from '@caffeinawa/types';

import { isPayMongoEnabled } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { PaymentEntity } from '../payment/entities/payment.entity.js';
import { PaymentService } from '../payment/payment.service.js';
import { StoreService } from '../store/store.service.js';
import { CartEntity } from './entities/cart.entity.js';

import type { AddCartItemDto } from './dto/add-cart-item.dto.js';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly storeService: StoreService,
  ) {}

  private toEntity(
    cart: Prisma.CartGetPayload<{
      include: {
        items: {
          include: {
            coffee: true;
          };
        };
      };
    }>,
  ): Cart {
    const items: CartItem[] = cart.items.map((item) => {
      const price = item.coffee.price.toNumber();

      return {
        id: item.id,
        coffeeId: item.coffeeId,
        coffee: {
          id: item.coffee.id,
          name: item.coffee.name,
          price,
          available: item.coffee.available,
          imageUrl: item.coffee.imageUrl ?? undefined,
        },
        quantity: item.quantity,
        subtotal: item.coffee.price.mul(item.quantity).toNumber(),
      };
    });

    const total = cart.items
      .reduce(
        (sum, item) => sum.add(item.coffee.price.mul(item.quantity)),
        new Prisma.Decimal(0),
      )
      .toNumber();

    return new CartEntity({
      id: cart.id,
      customerId: cart.customerId,
      revision: cart.revision,
      items,
      total,
    });
  }

  private async ensureCart(
    customerId: string,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer "${customerId}" not found`);
    }
    // Empty-update Prisma upserts can race on the first cart. PostgreSQL
    // ON CONFLICT DO NOTHING also covers a concurrent first GET or addition.
    await db.cart.createMany({ data: { customerId }, skipDuplicates: true });
  }

  private async findOrCreateCart(customerId: string) {
    await this.ensureCart(customerId, this.prisma);
    return this.prisma.cart.findUniqueOrThrow({
      where: { customerId },
      include: { items: { include: { coffee: true } } },
    });
  }

  async findOne(customerId: string): Promise<Cart> {
    const cart = await this.findOrCreateCart(customerId);
    return this.toEntity(cart);
  }

  private assertQuantity(quantity: number): void {
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_CART_ITEM_QUANTITY
    ) {
      throw new BadRequestException(
        `Quantity must be a whole number between 1 and ${MAX_CART_ITEM_QUANTITY} per coffee.`,
      );
    }
  }

  private async mutateCart(
    customerId: string,
    mutate: (tx: Prisma.TransactionClient, cartId: string) => Promise<void>,
  ): Promise<Cart> {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureCart(customerId, tx);

      // All cart writes share checkout's parent-row lock. Read items only
      // after acquiring it, including when the item has not been created yet.
      const [cart] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Cart"
        WHERE "customerId" = ${customerId}
        FOR UPDATE
      `;

      if (!cart) throw new NotFoundException('Cart not found');
      await mutate(tx, cart.id);
      await tx.cart.update({
        where: { id: cart.id },
        data: { revision: { increment: 1 } },
      });

      const updated = await tx.cart.findUniqueOrThrow({
        where: { customerId },
        include: { items: { include: { coffee: true } } },
      });
      return this.toEntity(updated);
    });
  }

  async addItem(customerId: string, dto: AddCartItemDto): Promise<Cart> {
    this.assertQuantity(dto.quantity);

    return this.mutateCart(customerId, async (tx, cartId) => {
      const coffee = await tx.coffee.findUnique({
        where: { id: dto.coffeeId },
      });
      if (!coffee) {
        throw new NotFoundException(`Coffee "${dto.coffeeId}" not found`);
      }
      if (!coffee.available) {
        throw new BadRequestException(
          `Coffee "${dto.coffeeId}" is not currently available`,
        );
      }

      const item = await tx.cartItem.findFirst({
        where: { cartId, coffeeId: dto.coffeeId },
      });
      this.assertQuantity((item?.quantity ?? 0) + dto.quantity);
      if (item) {
        // Invalid legacy data must be corrected explicitly, never on add.
        this.assertQuantity(item.quantity);
      }

      await tx.cartItem.upsert({
        where: { cartId_coffeeId: { cartId, coffeeId: dto.coffeeId } },
        create: { cartId, coffeeId: dto.coffeeId, quantity: dto.quantity },
        update: { quantity: { increment: dto.quantity } },
      });
    });
  }

  async updateItem(
    customerId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<Cart> {
    this.assertQuantity(dto.quantity);

    return this.mutateCart(customerId, async (tx, cartId) => {
      const item = await tx.cartItem.findFirst({
        where: { id: itemId, cartId },
      });
      if (!item) {
        throw new NotFoundException(`Cart item "${itemId}" not found`);
      }
      await tx.cartItem.update({
        where: { id: itemId },
        data: { quantity: dto.quantity },
      });
    });
  }

  async removeItem(customerId: string, itemId: string): Promise<Cart> {
    return this.mutateCart(customerId, async (tx, cartId) => {
      const item = await tx.cartItem.findFirst({
        where: { id: itemId, cartId },
      });
      if (!item) {
        throw new NotFoundException(`Cart item "${itemId}" not found`);
      }
      await tx.cartItem.delete({ where: { id: itemId } });
    });
  }

  async clear(customerId: string): Promise<Cart> {
    return this.mutateCart(customerId, async (tx, cartId) => {
      await tx.cartItem.deleteMany({ where: { cartId } });
    });
  }

  private assertRequest(provider: string, key: string, revision: number): void {
    if (
      !['cash', 'paymongo'].includes(provider) ||
      typeof key !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key,
      ) ||
      !Number.isInteger(revision) ||
      revision < 0 ||
      revision > 2147483647
    ) {
      throw new BadRequestException(
        'Refresh checkout before placing your order.',
      );
    }
  }

  private requestWhere(customerId: string, idempotencyKey: string) {
    return { customerId_idempotencyKey: { customerId, idempotencyKey } };
  }

  private async lockRequest(
    tx: Prisma.TransactionClient,
    customerId: string,
    key: string,
    provider: 'cash' | 'paymongo',
    revision: number,
  ) {
    if (!(await tx.customer.findUnique({ where: { id: customerId } }))) {
      throw new NotFoundException(`Customer "${customerId}" not found`);
    }
    // ON CONFLICT waits for a concurrent creator's transaction before we lock/read.
    await tx.checkoutRequest.createMany({
      data: {
        customerId,
        idempotencyKey: key,
        cartRevision: revision,
        paymentProvider:
          provider === 'cash' ? PaymentProvider.CASH : PaymentProvider.PAYMONGO,
      },
      skipDuplicates: true,
    });
    await tx.$queryRaw`
      SELECT "idempotencyKey" FROM "CheckoutRequest"
      WHERE "customerId" = ${customerId} AND "idempotencyKey" = ${key}::uuid
      FOR UPDATE
    `;
    return tx.checkoutRequest.findUniqueOrThrow({
      where: this.requestWhere(customerId, key),
      include: { order: { include: { items: true } } },
    });
  }

  private replay(
    request: Prisma.CheckoutRequestGetPayload<{
      include: { order: { include: { items: true } } };
    }>,
    provider: 'cash' | 'paymongo',
    revision: number,
  ): CheckoutReplayResult | null {
    if (
      request.paymentProvider.toLowerCase() !== provider ||
      request.cartRevision !== revision
    ) {
      throw new ConflictException({
        code: 'CHECKOUT_KEY_REUSED',
        message:
          'This checkout reference belongs to a different request. Check your previous checkout.',
      });
    }
    if (request.status !== CheckoutRequestStatus.COMPLETED) return null;
    if (!request.order)
      throw new ConflictException(
        'Unable to recover this order. Please contact the store.',
      );
    return {
      checkoutReplayed: true,
      paymentProvider: provider,
      order: this.mapOrder(request.order),
    };
  }

  private mapOrder(
    order: Prisma.OrderGetPayload<{ include: { items: true } }>,
  ): Order {
    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status.toLowerCase() as OrderStatus,
      total: order.total.toNumber(),
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        coffeeId: item.coffeeId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
      })),
    };
  }

  async recoverCheckout(
    customerId: string,
    provider: 'cash' | 'paymongo',
    key: string,
    revision: number,
  ): Promise<CheckoutRecoveryResult> {
    this.assertRequest(provider, key, revision);
    return this.prisma.$transaction(async (tx) => {
      const request = await this.lockRequest(
        tx,
        customerId,
        key,
        provider,
        revision,
      );
      const replay = this.replay(request, provider, revision);
      if (replay) return replay;
      // A durable tombstone closes an unused key, including requests still in transit.
      // This never cancels an order or changes a payment.
      await tx.checkoutRequest.update({
        where: this.requestWhere(customerId, key),
        data: { status: CheckoutRequestStatus.CANCELLED },
      });
      return { checkoutNotCreated: true };
    });
  }

  async checkout(
    customerId: string,
    paymentProvider: 'cash' | 'paymongo',
    key: string,
    revision: number,
  ): Promise<
    | Order
    | CheckoutReplayResult
    | {
        order: Order;
        payment: PaymentEntity;
        checkoutUrl: string;
      }
  > {
    this.assertRequest(paymentProvider, key, revision);
    const previous = await this.prisma.checkoutRequest.findUnique({
      where: this.requestWhere(customerId, key),
      include: { order: { include: { items: true } } },
    });
    if (previous) {
      const replay = this.replay(previous, paymentProvider, revision);
      if (replay) return replay;
    }
    if (paymentProvider === 'paymongo' && !isPayMongoEnabled()) {
      throw new BadRequestException(
        'PayMongo checkout is currently unavailable. Please choose cash.',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock order: checkout request -> cart -> store settings. No provider calls here.
      const request = await this.lockRequest(
        tx,
        customerId,
        key,
        paymentProvider,
        revision,
      );
      const replay = this.replay(request, paymentProvider, revision);
      if (replay) return replay;
      if (request.status === CheckoutRequestStatus.CANCELLED) {
        throw new ConflictException({
          code: 'CHECKOUT_REQUEST_CLOSED',
          message:
            'This checkout request is closed. Review your cart before placing a new order.',
        });
      }
      await tx.$queryRaw`
        SELECT "id" FROM "Cart" WHERE "customerId" = ${customerId} FOR UPDATE
      `;
      const cart = await tx.cart.findUnique({
        where: { customerId },
        include: { items: { include: { coffee: true } } },
      });
      await this.storeService.assertAcceptingOrders(tx);
      if (!cart || cart.items.length === 0)
        throw new BadRequestException('Cart is empty');
      if (cart.revision !== revision) {
        throw new ConflictException({
          code: 'CART_CHANGED',
          message: 'Your cart changed. Review it before checking out.',
        });
      }
      for (const item of cart.items) {
        this.assertQuantity(item.quantity);
        if (!item.coffee.available)
          throw new BadRequestException(
            `Coffee "${item.coffee.name}" is no longer available`,
          );
      }
      const orderItems = cart.items.map((item) => ({
        coffeeId: item.coffeeId,
        quantity: item.quantity,
        unitPrice: item.coffee.price,
      }));
      const total = orderItems.reduce(
        (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
        new Prisma.Decimal(0),
      );
      const createdOrder = await tx.order.create({
        data: { customerId, total, items: { create: orderItems } },
        include: { items: true },
      });
      if (paymentProvider === 'cash') {
        await this.paymentService.createCashPayment(tx, createdOrder.id, total);
      } else {
        await tx.payment.create({
          data: {
            orderId: createdOrder.id,
            provider: PaymentProvider.PAYMONGO,
            amount: total,
            currency: 'PHP',
            status: PaymentStatus.PENDING,
          },
        });
      }
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: { revision: { increment: 1 } },
      });
      await tx.checkoutRequest.update({
        where: this.requestWhere(customerId, key),
        data: {
          status: CheckoutRequestStatus.COMPLETED,
          orderId: createdOrder.id,
        },
      });
      return this.mapOrder(createdOrder);
    });
    if ('checkoutReplayed' in result) return result;
    if (paymentProvider === 'paymongo') {
      try {
        const payment = await this.paymentService.createPayMongoPayment(
          result.id,
        );
        return {
          order: result,
          payment: payment.payment,
          checkoutUrl: payment.checkoutUrl,
        };
      } catch {
        throw new BadGatewayException({
          statusCode: 502,
          code: 'PAYMENT_CHECKOUT_UNAVAILABLE',
          message:
            'Your order was created, but payment checkout could not be opened. Check this order before placing another.',
          orderId: result.id,
        });
      }
    }
    return result;
  }
}
