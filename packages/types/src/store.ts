import type { PaymentProvider } from './payment.js';

export interface StoreOrderingStatus {
  acceptingOrders: boolean;
  updatedAt: string | null;
  paymentMethods: PaymentProvider[];
}
