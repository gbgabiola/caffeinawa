import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrderStatus as PrismaOrderStatus } from '@prisma/client';
import type { Order, OrderStatus } from '@caffeinawa/types';

import { PrismaService } from '../database/prisma.service.js';
import type {
  CreateOrderDto,
  CreateOrderItemDto,
} from './dto/create-order.dto.js';
import type { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrderEntity } from './entities/order.entity.js';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(
    order: Prisma.OrderGetPayload<{
      include: {
        items: true;
      };
    }>,
  ): Order {
    return new OrderEntity({
      id: order.id,
      customerId: order.customerId,
      items: order.items.map((item) => ({
        id: item.id,
        coffeeId: item.coffeeId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
      })),
      status: order.status.toLowerCase() as OrderStatus,
      total: order.total.toNumber(),
      createdAt: order.createdAt.toISOString(),
    });
  }

  // Customer-facing: only return the authenticated customer's orders.
  async findAllByCustomer(customerId: string): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
      },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map((order) => this.toEntity(order));
  }

  // Customer-facing: only return an order owned by the authenticated customer.
  async findOneByCustomer(id: string, customerId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
        customerId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }

    return this.toEntity(order);
  }

  // Customer-facing: customer identity always comes from the JWT.
  async create(customerId: string, dto: CreateOrderDto): Promise<Order> {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer "${customerId}" not found`);
    }

    const coffeeIds = dto.items.map(
      (item: CreateOrderItemDto) => item.coffeeId,
    );

    const coffees = await this.prisma.coffee.findMany({
      where: {
        id: {
          in: coffeeIds,
        },
      },
    });

    if (coffees.length !== new Set(coffeeIds).size) {
      throw new BadRequestException('One or more coffee items do not exist');
    }

    const unavailableCoffee = coffees.find((coffee) => !coffee.available);

    if (unavailableCoffee) {
      throw new BadRequestException(
        `Coffee "${unavailableCoffee.id}" is not currently available`,
      );
    }

    const coffeeMap = new Map(coffees.map((coffee) => [coffee.id, coffee]));

    const items = dto.items.map((item) => {
      const coffee = coffeeMap.get(item.coffeeId)!;

      return {
        coffeeId: coffee.id,
        quantity: item.quantity,
        unitPrice: coffee.price,
      };
    });

    const total = items.reduce(
      (sum, item) => sum + item.unitPrice.toNumber() * item.quantity,
      0,
    );

    const order = await this.prisma.order.create({
      data: {
        customerId,
        status: PrismaOrderStatus.PENDING,
        total: new Prisma.Decimal(total),
        items: {
          create: items,
        },
      },
      include: {
        items: true,
      },
    });

    return this.toEntity(order);
  }

  // Admin-facing: return all orders.
  async findAll(): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map((order) => this.toEntity(order));
  }

  // Admin-facing: return any order by ID.
  async findOne(id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }

    return this.toEntity(order);
  }

  // Admin-facing: update order status.
  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    await this.findOne(id);

    const order = await this.prisma.order.update({
      where: {
        id,
      },
      data: {
        status: dto.status.toUpperCase() as PrismaOrderStatus,
      },
      include: {
        items: true,
      },
    });

    return this.toEntity(order);
  }
}
