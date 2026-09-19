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

  async findOne(id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }

    return this.toEntity(order);
  }

  async create(dto: CreateOrderDto): Promise<Order> {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id: dto.customerId,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer "${dto.customerId}" not found`);
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
        customerId: dto.customerId,
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

  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    await this.findOne(id);

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status.toUpperCase() as PrismaOrderStatus,
      },
      include: {
        items: true,
      },
    });

    return this.toEntity(order);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.order.delete({
      where: { id },
    });
  }
}
