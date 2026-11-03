import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Payment, PayMongoCheckoutAttempt } from '@prisma/client';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type {
  PaymentCheckoutStatus,
  PaymentResumeResult,
} from '@caffeinawa/types';
import { isPayMongoEnabled } from '../config/environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { PayMongoService } from './paymongo.service.js';

const INCLUDE = {
  customer: { select: { name: true, email: true } },
  items: { include: { coffee: { select: { name: true } } } },
  payments: { include: { checkoutAttempt: true } },
} satisfies Prisma.OrderInclude;
const REVIEW =
  'This payment needs review by the store. Check this order before placing another.';

@Injectable()
export class PayMongoCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PayMongoService,
  ) {}

  private pendingPayment<T extends Payment>(order: {
    status: OrderStatus;
    total: Prisma.Decimal;
    payments: T[];
  }): T {
    // Refuse ambiguous legacy orders with multiple payments or a different method.
    const payment = order.payments[0];
    if (
      order.status !== OrderStatus.PENDING ||
      order.payments.length !== 1 ||
      payment?.provider !== PaymentProvider.PAYMONGO ||
      payment.status !== PaymentStatus.PENDING ||
      !payment.amount.equals(order.total) ||
      payment.currency !== 'PHP'
    )
      throw new ConflictException(REVIEW);
    return payment;
  }

  private async ownOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, customerId },
      include: INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async status(
    customerId: string,
    orderId: string,
  ): Promise<PaymentCheckoutStatus> {
    const order = await this.ownOrder(customerId, orderId);
    if (
      order.status !== OrderStatus.PENDING ||
      !order.payments.some(
        (payment) => payment.provider === PaymentProvider.PAYMONGO,
      )
    )
      return { canResume: false, message: '' };
    if (!isPayMongoEnabled())
      return {
        canResume: false,
        message:
          'Online payment checkout is currently unavailable. Contact the store for help with an existing order.',
      };
    try {
      const payment = this.pendingPayment(order);
      if (
        !payment.checkoutSessionId &&
        (!payment.checkoutAttempt ||
          payment.checkoutAttempt.startedAt !== null ||
          !this.provider.canStartCreation(payment.checkoutAttempt))
      )
        return { canResume: false, message: REVIEW };
      return {
        canResume: true,
        message:
          'Continue payment for this existing order. No replacement order will be created.',
      };
    } catch {
      return { canResume: false, message: REVIEW };
    }
  }

  async prepareNew(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    // Called only inside the transaction that creates this order and payment.
    // A crash immediately after checkout commit must still leave a retryable snapshot.
    // Query relation branches sequentially on the transaction's single pg client.
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    const payment = this.pendingPayment(order);
    const customer = await tx.customer.findUniqueOrThrow({
      where: { id: order.customerId },
      select: { name: true, email: true },
    });
    const items = await tx.orderItem.findMany({
      where: { orderId },
      include: { coffee: { select: { name: true } } },
    });
    const prepared = this.provider.prepareCheckoutSession({
      orderId,
      customerName: customer.name,
      customerEmail: customer.email,
      items: items.map((item) => ({
        name: item.coffee.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toNumber(),
      })),
    });
    await tx.payMongoCheckoutAttempt.create({
      data: { paymentId: payment.id, ...prepared },
    });
  }

  private async prepare(orderId: string, customerId?: string) {
    if (!isPayMongoEnabled())
      throw new ServiceUnavailableException(
        'Online payment checkout is currently unavailable.',
      );
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, ...(customerId ? { customerId } : {}) },
      include: INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    const payment = this.pendingPayment(order);
    // Legacy missing snapshots are ambiguous, even if no session ID is saved.
    if (!payment.checkoutSessionId && !payment.checkoutAttempt)
      throw new ConflictException(REVIEW);
    return { order, payment, attempt: payment.checkoutAttempt };
  }

  private async attachSession(paymentId: string, sessionId: string) {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, checkoutSessionId: null },
      data: { checkoutSessionId: sessionId },
    });
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (payment.checkoutSessionId !== sessionId)
      throw new ConflictException(REVIEW);
    return payment;
  }

  private async createOnce(attempt: PayMongoCheckoutAttempt, orderId: string) {
    if (!this.provider.canStartCreation(attempt))
      throw new ConflictException(REVIEW);
    // A durable one-way claim, not a lease. Never release/reset it on a failure:
    // provider checkout creation did not replay same-key requests in sandbox verification.
    const startedAt = new Date();
    const claim = await this.prisma.payMongoCheckoutAttempt.updateMany({
      where: { paymentId: attempt.paymentId, startedAt: null },
      data: { startedAt },
    });
    if (claim.count !== 1) throw new ConflictException(REVIEW);
    const session = await this.provider.createCheckoutSession(
      { ...attempt, startedAt },
      orderId,
    );
    const payment = await this.attachSession(
      attempt.paymentId,
      session.sessionId,
    );
    return { session, payment };
  }

  async create(orderId: string) {
    const prepared = await this.prepare(orderId);
    if (prepared.payment.checkoutSessionId || !prepared.attempt)
      throw new ConflictException(REVIEW);
    const result = await this.createOnce(prepared.attempt, orderId);
    const current = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: INCLUDE,
    });
    this.pendingPayment(current);
    return { payment: result.payment, checkoutUrl: result.session.checkoutUrl };
  }

  async resume(
    customerId: string,
    orderId: string,
  ): Promise<PaymentResumeResult> {
    await this.ownOrder(customerId, orderId);
    const prepared = await this.prepare(orderId, customerId);
    let sessionId = prepared.payment.checkoutSessionId;
    if (!sessionId) {
      if (!prepared.attempt) throw new ConflictException(REVIEW);
      // Only a never-started attempt may make its first provider POST.
      const result = await this.createOnce(prepared.attempt, orderId);
      sessionId = result.session.sessionId;
    }
    const cents = prepared.order.total.mul(100);
    if (!cents.isInteger() || !Number.isSafeInteger(cents.toNumber()))
      throw new ConflictException(REVIEW);
    const session = await this.provider.retrieveCheckoutSession(
      sessionId,
      orderId,
      cents.toNumber(),
    );
    const current = await this.ownOrder(customerId, orderId);
    if (
      current.payments.some((payment) => payment.status === PaymentStatus.PAID)
    ) {
      return {
        status: 'awaiting_confirmation',
        message:
          'Payment is recorded. Refresh the order status for confirmation.',
      };
    }
    this.pendingPayment(current);
    if (session.paymentState !== 'unpaid')
      return {
        status: 'awaiting_confirmation',
        message:
          'Payment is being checked. Refresh the order status before attempting another payment.',
      };
    if (session.status !== 'active')
      return {
        status: 'unavailable',
        message:
          'This payment checkout is closed. Contact the store for help with this order.',
      };
    return { status: 'ready', checkoutUrl: session.checkoutUrl };
  }
}
