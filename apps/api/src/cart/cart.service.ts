import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import type { Cart, CartItem, Order, OrderStatus } from '@caffeinawa/types';

import { PrismaService } from '../database/prisma.service.js';
import { PaymentEntity } from '../payment/entities/payment.entity.js';
import { PaymentService } from '../payment/payment.service.js';
import type { AddCartItemDto } from './dto/add-cart-item.dto.js';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { CartEntity } from './entities/cart.entity.js';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
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
        subtotal: price * item.quantity,
      };
    });

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    return new CartEntity({
      id: cart.id,
      customerId: cart.customerId,
      items,
      total,
    });
  }

  private async findOrCreateCart(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer "${customerId}" not found`);
    }

    return this.prisma.cart.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
      include: {
        items: {
          include: {
            coffee: true,
          },
        },
      },
    });
  }

  async findOne(customerId: string): Promise<Cart> {
    const cart = await this.findOrCreateCart(customerId);
    return this.toEntity(cart);
  }

  async addItem(customerId: string, dto: AddCartItemDto): Promise<Cart> {
    const cart = await this.findOrCreateCart(customerId);

    const coffee = await this.prisma.coffee.findUnique({
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

    await this.prisma.cartItem.upsert({
      where: {
        cartId_coffeeId: {
          cartId: cart.id,
          coffeeId: dto.coffeeId,
        },
      },
      create: {
        cartId: cart.id,
        coffeeId: dto.coffeeId,
        quantity: dto.quantity,
      },
      update: {
        quantity: {
          increment: dto.quantity,
        },
      },
    });

    return this.findOne(customerId);
  }

  async updateItem(
    customerId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<Cart> {
    const cart = await this.findOrCreateCart(customerId);

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
    });

    if (!item) {
      throw new NotFoundException(`Cart item "${itemId}" not found`);
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
      },
    });

    return this.findOne(customerId);
  }

  async removeItem(customerId: string, itemId: string): Promise<Cart> {
    const cart = await this.findOrCreateCart(customerId);

    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
    });

    if (!item) {
      throw new NotFoundException(`Cart item "${itemId}" not found`);
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return this.findOne(customerId);
  }

  async clear(customerId: string): Promise<Cart> {
    const cart = await this.findOrCreateCart(customerId);

    await this.prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
      },
    });

    return this.findOne(customerId);
  }

  async checkout(
    customerId: string,
    paymentProvider: 'cash' | 'paymongo' = 'cash',
  ): Promise<
    | Order
    | {
        order: Order;
        payment: PaymentEntity;
        checkoutUrl: string;
      }
  > {
    const order = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new NotFoundException(`Customer "${customerId}" not found`);
      }

      const cart = await tx.cart.findUnique({
        where: { customerId },
        include: {
          items: {
            include: {
              coffee: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      for (const item of cart.items) {
        if (!item.coffee.available) {
          throw new BadRequestException(
            `Coffee "${item.coffee.name}" is no longer available`,
          );
        }
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
        data: {
          customerId,
          total,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: true,
        },
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

      await tx.cartItem.deleteMany({
        where: {
          cartId: cart.id,
        },
      });

      return {
        id: createdOrder.id,
        customerId: createdOrder.customerId,
        status: createdOrder.status.toLowerCase() as OrderStatus,
        total: createdOrder.total.toNumber(),
        createdAt: createdOrder.createdAt.toISOString(),
        items: createdOrder.items.map((item) => ({
          id: item.id,
          coffeeId: item.coffeeId,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toNumber(),
        })),
      };
    });

    if (paymentProvider === 'paymongo') {
      const payment = await this.paymentService.createPayMongoPayment(order.id);

      return {
        order,
        payment: payment.payment,
        checkoutUrl: payment.checkoutUrl,
      };
    }

    return order;
  }
}
