import type { Payment } from '@caffeinawa/types';

export class PaymentEntity implements Payment {
  id: string;
  orderId: string;
  provider: Payment['provider'];
  checkoutSessionId?: string;
  paymentIntentId?: string;
  amount: number;
  currency: string;
  status: Payment['status'];
  paidAt?: string;
  createdAt: string;
  updatedAt: string;

  constructor(payment: Payment) {
    this.id = payment.id;
    this.orderId = payment.orderId;
    this.provider = payment.provider;
    this.checkoutSessionId = payment.checkoutSessionId;
    this.paymentIntentId = payment.paymentIntentId;
    this.amount = payment.amount;
    this.currency = payment.currency;
    this.status = payment.status;
    this.paidAt = payment.paidAt;
    this.createdAt = payment.createdAt;
    this.updatedAt = payment.updatedAt;
  }
}
