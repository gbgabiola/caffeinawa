import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service.js';
import { PaymentEntity } from './entities/payment.entity.js';

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PaymentEntity[]> {
    const payments = await this.prisma.payment.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return payments.map((payment) => this.toEntity(payment));
  }

  async findOne(id: string): Promise<PaymentEntity> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException(`Payment "${id}" not found`);
    }

    return this.toEntity(payment);
  }

  async createCashPayment(
    tx: Prisma.TransactionClient,
    orderId: string,
    amount: Prisma.Decimal,
  ): Promise<PaymentEntity> {
    const payment = await tx.payment.create({
      data: {
        orderId,
        provider: PaymentProvider.CASH,
        amount,
        currency: 'PHP',
        status: PaymentStatus.PENDING,
      },
    });

    return this.toEntity(payment);
  }

  async markCashPaymentAsPaid(id: string): Promise<PaymentEntity> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id },
      });

      if (!payment) {
        throw new NotFoundException(`Payment "${id}" not found`);
      }

      if (payment.provider !== PaymentProvider.CASH) {
        throw new BadRequestException(
          'Only cash payments can be manually marked as paid',
        );
      }

      if (payment.status === PaymentStatus.PAID) {
        return this.toEntity(payment);
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(
          `Payment cannot be marked as paid from status "${payment.status}"`,
        );
      }

      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      await tx.order.update({
        where: {
          id: payment.orderId,
        },
        data: {
          status: OrderStatus.CONFIRMED,
        },
      });

      return this.toEntity(updatedPayment);
    });
  }

  private toEntity(payment: {
    id: string;
    orderId: string;
    provider: PaymentProvider;
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    amount: Prisma.Decimal;
    currency: string;
    status: PaymentStatus;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentEntity {
    return new PaymentEntity({
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider.toLowerCase() as PaymentEntity['provider'],
      checkoutSessionId: payment.checkoutSessionId ?? undefined,
      paymentIntentId: payment.paymentIntentId ?? undefined,
      amount: payment.amount.toNumber(),
      currency: payment.currency,
      status: payment.status.toLowerCase() as PaymentEntity['status'],
      paidAt: payment.paidAt?.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    });
  }
}
