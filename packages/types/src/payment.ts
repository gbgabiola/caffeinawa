export type PaymentProvider = 'cash' | 'paymongo';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';

export interface Payment {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  providerEventId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCheckoutStatus {
  canResume: boolean;
  message: string;
}

export type PaymentResumeResult =
  | { status: 'ready'; checkoutUrl: string }
  | { status: 'awaiting_confirmation' | 'unavailable'; message: string };
