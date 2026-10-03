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
import type { AdminPayment } from '@caffeinawa/types';

import { PrismaService } from '../database/prisma.service.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { PayMongoService } from './paymongo.service.js';

const ADMIN_PAYMENT_INCLUDE = {
  order: {
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          coffee: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

type AdminPaymentRecord = Prisma.PaymentGetPayload<{
  include: typeof ADMIN_PAYMENT_INCLUDE;
}>;

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payMongoService: PayMongoService,
  ) {}

  async findAll(): Promise<AdminPayment[]> {
    const payments = await this.prisma.payment.findMany({
      include: ADMIN_PAYMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => this.toAdminEntity(payment));
  }

  async findOne(id: string): Promise<AdminPayment> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: ADMIN_PAYMENT_INCLUDE,
    });

    if (!payment) {
      throw new NotFoundException(`Payment "${id}" not found`);
    }

    return this.toAdminEntity(payment);
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

  async markCashPaymentAsPaid(id: string): Promise<AdminPayment> {
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
        const existingPayment = await tx.payment.findUnique({
          where: { id },
          include: ADMIN_PAYMENT_INCLUDE,
        });

        if (!existingPayment) {
          throw new NotFoundException(`Payment "${id}" not found`);
        }

        return this.toAdminEntity(existingPayment);
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
        where: { id: payment.orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      const updatedPaymentWithRelations = await tx.payment.findUnique({
        where: { id: updatedPayment.id },
        include: ADMIN_PAYMENT_INCLUDE,
      });

      if (!updatedPaymentWithRelations) {
        throw new NotFoundException(`Payment "${id}" not found`);
      }

      return this.toAdminEntity(updatedPaymentWithRelations);
    });
  }

  async createPayMongoPayment(orderId: string): Promise<{
    payment: PaymentEntity;
    checkoutUrl: string;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        items: {
          include: {
            coffee: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        provider: PaymentProvider.PAYMONGO,
        status: PaymentStatus.PENDING,
      },
    });

    if (existingPayment?.checkoutSessionId) {
      throw new BadRequestException(
        'This order already has a pending PayMongo payment',
      );
    }

    const session = await this.payMongoService.createCheckoutSession({
      orderId: order.id,
      amount: order.total.toNumber(),
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      items: order.items.map((item) => ({
        name: item.coffee.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
      })),
    });

    const payment = existingPayment
      ? await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: { checkoutSessionId: session.sessionId },
        })
      : await this.prisma.payment.create({
          data: {
            orderId: order.id,
            provider: PaymentProvider.PAYMONGO,
            checkoutSessionId: session.sessionId,
            amount: order.total,
            currency: 'PHP',
            status: PaymentStatus.PENDING,
          },
        });

    return {
      payment: this.toEntity(payment),
      checkoutUrl: session.checkoutUrl,
    };
  }

  async handlePayMongoPaymentPaid(
    event: {
      id: string;
      type: string;
      attributes: {
        type: string;
        livemode: boolean;
        data: {
          id: string;
          type: string;
          attributes: {
            reference_number?: string;
            payment_intent?: { id?: string };
          };
        };
      };
    },
    _rawBody: Buffer,
  ): Promise<void> {
    const checkoutSessionId = event.attributes.data.id;
    const referenceNumber = event.attributes.data.attributes.reference_number;
    const paymentIntentId = event.attributes.data.attributes.payment_intent?.id;

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { checkoutSessionId },
      });

      if (!payment) {
        throw new NotFoundException(
          `Payment for Checkout Session "${checkoutSessionId}" not found`,
        );
      }

      if (
        payment.providerEventId === event.id ||
        payment.status === PaymentStatus.PAID
      ) {
        return;
      }

      if (referenceNumber && referenceNumber !== payment.orderId) {
        throw new BadRequestException(
          'PayMongo order reference does not match payment order',
        );
      }

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paymentIntentId,
          providerEventId: event.id,
          paidAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: updatedPayment.orderId },
        data: { status: OrderStatus.CONFIRMED },
      });
    });
  }

  private toAdminEntity(payment: AdminPaymentRecord): AdminPayment {
    return {
      ...this.toEntity(payment),
      order: {
        customer: {
          id: payment.order.customer.id,
          name: payment.order.customer.name,
          email: payment.order.customer.email,
        },
        items: payment.order.items.map((item) => ({
          coffeeName: item.coffee.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toNumber(),
        })),
      },
    };
  }

  private toEntity(payment: {
    id: string;
    orderId: string;
    provider: PaymentProvider;
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    providerEventId: string | null;
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
      providerEventId: payment.providerEventId ?? undefined,
      amount: payment.amount.toNumber(),
      currency: payment.currency,
      status: payment.status.toLowerCase() as PaymentEntity['status'],
      paidAt: payment.paidAt?.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    });
  }
}
