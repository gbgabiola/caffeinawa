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

import { toPaginatedResponse } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { PayMongoService } from './paymongo.service.js';

import type { AdminPayment } from '@caffeinawa/types';
import type { AdminPaymentQueryDto } from './dto/admin-payment-query.dto.js';
import type { PaymentReconciliationQueryDto } from './dto/payment-reconciliation-query.dto.js';

const ADMIN_PAYMENT_INCLUDE = {
  order: {
    include: {
      customer: { select: { id: true, name: true, email: true } },
      items: { include: { coffee: { select: { name: true } } } },
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

  async findAll(query: AdminPaymentQueryDto) {
    const { page, pageSize, search, provider, status } = query;
    const where: Prisma.PaymentWhereInput = {
      ...(provider && { provider: provider.toUpperCase() as PaymentProvider }),
      ...(status && { status: status.toUpperCase() as PaymentStatus }),
      ...(search && {
        OR: [
          {
            order: {
              customer: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            order: {
              customer: {
                email: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            order: {
              items: {
                some: {
                  coffee: {
                    name: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    };
    const total = await this.prisma.payment.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const payments = await this.prisma.payment.findMany({
      where,
      include: ADMIN_PAYMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return toPaginatedResponse(
      payments.map((payment) => this.toAdminEntity(payment)),
      normalizedPage,
      pageSize,
      total,
    );
  }

  async findReconciliationCandidates(query: PaymentReconciliationQueryDto) {
    const { page, pageSize, ageHours } = query;

    const cutoff = new Date(Date.now() - ageHours * 60 * 60 * 1000);

    const where: Prisma.PaymentWhereInput = {
      OR: [
        {
          status: PaymentStatus.PENDING,
          createdAt: {
            lt: cutoff,
          },
        },
        {
          status: PaymentStatus.PAID,
          order: {
            status: OrderStatus.CANCELLED,
          },
        },
      ],
    };

    const total = await this.prisma.payment.count({
      where,
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const normalizedPage = Math.min(page, totalPages);

    const payments = await this.prisma.payment.findMany({
      where,
      include: ADMIN_PAYMENT_INCLUDE,
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    const data = payments.map((payment) => {
      const reconciliationReason =
        payment.status === PaymentStatus.PAID
          ? 'PAID_ORDER_CANCELLED'
          : 'STALE_PENDING_PAYMENT';

      return {
        ...this.toAdminEntity(payment),
        reconciliationReason,
      };
    });

    return toPaginatedResponse(data, normalizedPage, pageSize, total);
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
      const payment = await tx.payment.findUnique({ where: { id } });

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
        data: { status: PaymentStatus.PAID, paidAt: new Date() },
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
      include: { customer: true, items: { include: { coffee: true } } },
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
            payment_intent?: {
              id?: string;
            };
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
        where: {
          checkoutSessionId,
        },
      });

      if (!payment) {
        throw new NotFoundException(
          `Payment for Checkout Session "${checkoutSessionId}" not found`,
        );
      }

      if (payment.provider !== PaymentProvider.PAYMONGO) {
        throw new BadRequestException(
          'Checkout Session is not associated with a PayMongo payment',
        );
      }

      if (referenceNumber && referenceNumber !== payment.orderId) {
        throw new BadRequestException(
          'PayMongo order reference does not match payment order',
        );
      }

      // An already-settled payment must not be processed twice.
      if (payment.status === PaymentStatus.PAID) {
        return;
      }

      // Reject transitions from terminal failure states.
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(
          `Payment cannot be marked as paid from status "${payment.status}"`,
        );
      }

      // Compare-and-set: PostgreSQL updates only a still-pending
      // PayMongo payment. Concurrent deliveries cannot both win.
      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          provider: PaymentProvider.PAYMONGO,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.PAID,
          paymentIntentId,
          providerEventId: event.id,
          paidAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        // Another transaction may have settled the payment.
        // Re-read it within the transaction before deciding.
        const currentPayment = await tx.payment.findUnique({
          where: {
            id: payment.id,
          },
        });

        if (currentPayment?.status === PaymentStatus.PAID) {
          return;
        }

        if (!currentPayment) {
          throw new NotFoundException(`Payment "${payment.id}" not found`);
        }

        throw new BadRequestException(
          `Payment cannot be marked as paid from status "${currentPayment.status}"`,
        );
      }

      // Only confirm a pending order. Do not regress an order
      // that has already progressed beyond confirmation.
      const confirmed = await tx.order.updateMany({
        where: {
          id: payment.orderId,
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.CONFIRMED,
        },
      });

      if (confirmed.count === 1) {
        return;
      }

      const order = await tx.order.findUnique({
        where: {
          id: payment.orderId,
        },
      });

      if (!order) {
        throw new NotFoundException(`Order "${payment.orderId}" not found`);
      }

      // Payment can arrive after operational order progression.
      // Preserve the order's more advanced status.
      if (
        order.status === OrderStatus.CONFIRMED ||
        order.status === OrderStatus.PREPARING ||
        order.status === OrderStatus.READY ||
        order.status === OrderStatus.COMPLETED
      ) {
        return;
      }

      // A cancelled order must never be silently confirmed or
      // marked paid. Throwing rolls back the payment update.
      throw new BadRequestException(
        `Cannot confirm an order with status "${order.status}"`,
      );
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
