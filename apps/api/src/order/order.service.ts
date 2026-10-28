import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  OrderStatus as PrismaOrderStatus,
} from '@prisma/client';

import { toPaginatedResponse } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { OrderEntity } from './entities/order.entity.js';
import { StoreService } from '../store/store.service.js';
import { ORDER_TRANSITIONS } from './order-transitions.js';

import type { AdminOrder, Order, OrderStatus } from '@caffeinawa/types';
import type { AdminOrderQueryDto } from './dto/admin-order-query.dto.js';
import type {
  CreateOrderDto,
  CreateOrderItemDto,
} from './dto/create-order.dto.js';
import type { UpdateOrderDto } from './dto/update-order.dto.js';

const ADMIN_ORDER_INCLUDE = {
  items: true,
  customer: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OrderInclude;
type AdminOrderRecord = Prisma.OrderGetPayload<{
  include: typeof ADMIN_ORDER_INCLUDE;
}>;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeService: StoreService,
  ) {}
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

  private toAdminEntity(order: AdminOrderRecord): AdminOrder {
    return {
      ...this.toEntity(order),
      customer: {
        id: order.customer.id,
        name: order.customer.name,
        email: order.customer.email,
      },
    };
  }

  async findAllByCustomer(customerId: string): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => this.toEntity(order));
  }

  async findOneByCustomer(id: string, customerId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id, customerId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }

    return this.toEntity(order);
  }

  async create(customerId: string, dto: CreateOrderDto): Promise<Order> {
    const order = await this.prisma.$transaction(async (tx) => {
      await this.storeService.assertAcceptingOrders(tx);

      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new NotFoundException(`Customer "${customerId}" not found`);
      }

      const coffeeIds = dto.items.map(
        (item: CreateOrderItemDto) => item.coffeeId,
      );

      const coffees = await tx.coffee.findMany({
        where: { id: { in: coffeeIds } },
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

      return tx.order.create({
        data: {
          customerId,
          status: PrismaOrderStatus.PENDING,
          total: new Prisma.Decimal(total),
          items: { create: items },
        },
        include: { items: true },
      });
    });

    return this.toEntity(order);
  }

  async findAll(query: AdminOrderQueryDto) {
    const { page, pageSize, search, status } = query;
    const where: Prisma.OrderWhereInput = {
      ...(status && { status: status.toUpperCase() as PrismaOrderStatus }),
      ...(search && {
        customer: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };
    const total = await this.prisma.order.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const orders = await this.prisma.order.findMany({
      where,
      include: ADMIN_ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return toPaginatedResponse(
      orders.map((order) => this.toAdminEntity(order)),
      normalizedPage,
      pageSize,
      total,
    );
  }

  async findOne(id: string): Promise<AdminOrder> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ADMIN_ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException(`Order "${id}" not found`);
    }

    return this.toAdminEntity(order);
  }

  async update(id: string, dto: UpdateOrderDto): Promise<AdminOrder> {
    const nextStatus = dto.status.toUpperCase() as PrismaOrderStatus;

    return this.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({
        where: { id },
        include: ADMIN_ORDER_INCLUDE,
      });

      if (!currentOrder) {
        throw new NotFoundException(`Order "${id}" not found`);
      }

      // Repeating the current status is harmless and requires no write.
      if (currentOrder.status === nextStatus) {
        return this.toAdminEntity(currentOrder);
      }

      if (!ORDER_TRANSITIONS[currentOrder.status].includes(nextStatus)) {
        throw new ConflictException(
          `Order cannot change from "${currentOrder.status}" to "${nextStatus}"`,
        );
      }

      if (nextStatus === PrismaOrderStatus.CONFIRMED) {
        const paidPayment = await tx.payment.findFirst({
          where: {
            orderId: id,
            status: PaymentStatus.PAID,
          },
          select: { id: true },
        });

        if (!paidPayment) {
          throw new ConflictException(
            'Order cannot be confirmed before payment is recorded as paid',
          );
        }
      }

      const updated = await tx.order.updateMany({
        where: {
          id,
          status: currentOrder.status,
        },
        data: {
          status: nextStatus,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Order status changed while updating. Refresh and try again.',
        );
      }

      const updatedOrder = await tx.order.findUnique({
        where: { id },
        include: ADMIN_ORDER_INCLUDE,
      });

      if (!updatedOrder) {
        throw new NotFoundException(`Order "${id}" not found`);
      }

      return this.toAdminEntity(updatedOrder);
    });
  }
}
