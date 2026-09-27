export type PaymentProvider = 'paymongo';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';

export interface Payment {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  checkoutSessionId: string;
  paymentIntentId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}
