import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentIssueReason,
  PaymentIssueStatus,
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
import type { PaymentIssueQueryDto } from './dto/payment-issue-query.dto.js';
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
const paymentLogger = new Logger('PaymentService');

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

  async findReconciliationIssues(query: PaymentIssueQueryDto) {
    const { page, pageSize, status, search } = query;

    const where: Prisma.PaymentReconciliationIssueWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              {
                providerEventId: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                checkoutSessionId: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                paymentId: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                orderId: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const total = await this.prisma.paymentReconciliationIssue.count({
      where,
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);

    const issues = await this.prisma.paymentReconciliationIssue.findMany({
      where,
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return toPaginatedResponse(issues, normalizedPage, pageSize, total);
  }

  async markReconciliationIssueReviewed(id: string) {
    const result = await this.prisma.paymentReconciliationIssue.updateMany({
      where: {
        id,
        status: PaymentIssueStatus.OPEN,
      },
      data: {
        status: PaymentIssueStatus.REVIEWED,
        reviewedAt: new Date(),
      },
    });

    const issue = await this.prisma.paymentReconciliationIssue.findUnique({
      where: { id },
    });

    if (!issue) {
      throw new NotFoundException(
        `Payment reconciliation issue "${id}" not found`,
      );
    }

    // A repeated request returns the existing reviewed record
    // without changing its original reviewedAt timestamp.
    if (result.count === 0 && issue.status !== PaymentIssueStatus.REVIEWED) {
      throw new BadRequestException(
        'Payment reconciliation issue could not be reviewed',
      );
    }

    return issue;
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
      const readPayment = async () => {
        const payment = await tx.payment.findUnique({
          where: { id },
          include: ADMIN_PAYMENT_INCLUDE,
        });

        if (!payment) {
          throw new NotFoundException(`Payment "${id}" not found`);
        }

        if (payment.provider !== PaymentProvider.CASH) {
          throw new BadRequestException(
            'Only cash payments can be manually marked as paid',
          );
        }

        return payment;
      };

      const payment = await readPayment();

      if (payment.status === PaymentStatus.PAID) {
        return this.toAdminEntity(payment);
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(
          `Payment cannot be marked as paid from status "${payment.status}"`,
        );
      }

      const claimed = await tx.payment.updateMany({
        where: {
          id,
          provider: PaymentProvider.CASH,
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        // Another request may have settled the payment while this
        // transaction was waiting for the payment row.
        const currentPayment = await readPayment();

        if (currentPayment.status === PaymentStatus.PAID) {
          return this.toAdminEntity(currentPayment);
        }

        throw new BadRequestException(
          `Payment cannot be marked as paid from status "${currentPayment.status}"`,
        );
      }

      const confirmed = await tx.order.updateMany({
        where: {
          id: payment.orderId,
          status: OrderStatus.PENDING,
        },
        data: {
          status: OrderStatus.CONFIRMED,
        },
      });

      if (confirmed.count === 0) {
        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
        });

        if (!order) {
          throw new NotFoundException(`Order "${payment.orderId}" not found`);
        }

        const progressed =
          order.status === OrderStatus.CONFIRMED ||
          order.status === OrderStatus.PREPARING ||
          order.status === OrderStatus.READY ||
          order.status === OrderStatus.COMPLETED;

        if (!progressed) {
          // Throwing rolls back the payment claim and its paidAt timestamp.
          throw new BadRequestException(
            `Cannot settle cash payment for an order with status "${order.status}"`,
          );
        }
      }

      return this.toAdminEntity(await readPayment());
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

    let paymentId: string | undefined;
    let orderId: string | undefined;
    let issueReason: PaymentIssueReason | undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findFirst({
          where: {
            checkoutSessionId,
          },
        });

        if (!payment) {
          issueReason = PaymentIssueReason.PAYMENT_NOT_FOUND;

          throw new NotFoundException(
            `Payment for Checkout Session "${checkoutSessionId}" not found`,
          );
        }

        paymentId = payment.id;
        orderId = payment.orderId;

        if (payment.provider !== PaymentProvider.PAYMONGO) {
          issueReason = PaymentIssueReason.INVALID_PROVIDER;

          throw new BadRequestException(
            'Checkout Session is not associated with a PayMongo payment',
          );
        }

        if (referenceNumber && referenceNumber !== payment.orderId) {
          issueReason = PaymentIssueReason.ORDER_REFERENCE_MISMATCH;

          throw new BadRequestException(
            'PayMongo order reference does not match payment order',
          );
        }

        if (payment.status === PaymentStatus.PAID) {
          return;
        }

        if (payment.status !== PaymentStatus.PENDING) {
          issueReason = PaymentIssueReason.INVALID_PAYMENT_STATUS;

          throw new BadRequestException(
            `Payment cannot be marked as paid from status "${payment.status}"`,
          );
        }

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
          const currentPayment = await tx.payment.findUnique({
            where: {
              id: payment.id,
            },
          });

          if (currentPayment?.status === PaymentStatus.PAID) {
            return;
          }

          if (!currentPayment) {
            issueReason = PaymentIssueReason.PAYMENT_NOT_FOUND;

            throw new NotFoundException(`Payment "${payment.id}" not found`);
          }

          issueReason = PaymentIssueReason.INVALID_PAYMENT_STATUS;

          throw new BadRequestException(
            `Payment cannot be marked as paid from status "${currentPayment.status}"`,
          );
        }

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
          issueReason = PaymentIssueReason.ORDER_NOT_FOUND;

          throw new NotFoundException(`Order "${payment.orderId}" not found`);
        }

        if (
          order.status === OrderStatus.CONFIRMED ||
          order.status === OrderStatus.PREPARING ||
          order.status === OrderStatus.READY ||
          order.status === OrderStatus.COMPLETED
        ) {
          return;
        }

        issueReason = PaymentIssueReason.INVALID_ORDER_STATUS;

        throw new BadRequestException(
          `Cannot confirm an order with status "${order.status}"`,
        );
      });
    } catch (error: unknown) {
      // An unexpected database or application error should not
      // be disguised as a payment-state conflict.
      if (!issueReason) {
        throw error;
      }

      // The settlement transaction has already rolled back.
      // This write is separate, so the issue remains durable.
      try {
        await this.prisma.paymentReconciliationIssue.upsert({
          where: {
            providerEventId: event.id,
          },
          create: {
            providerEventId: event.id,
            checkoutSessionId,
            paymentId,
            orderId,
            reason: issueReason,
            status: PaymentIssueStatus.OPEN,
          },
          update: {},
        });
      } catch (auditError: unknown) {
        paymentLogger.error(
          `Failed to record reconciliation issue for PayMongo event ${event.id}`,
          auditError instanceof Error ? auditError.stack : String(auditError),
        );
      }

      // Preserve the original HTTP error. PayMongo can retry
      // the webhook, while operators have a durable audit record
      // when the audit write succeeds.
      throw error;
    }
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
