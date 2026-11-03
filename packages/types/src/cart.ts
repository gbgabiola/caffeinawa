import type { Order } from './order.js';
import type { PaymentProvider } from './payment.js';

import type { Coffee } from './coffee.js';

export interface CartItem {
  id: string;
  coffeeId: string;
  coffee: Pick<Coffee, 'id' | 'name' | 'price' | 'available' | 'imageUrl'>;
  quantity: number;
  subtotal: number;
}

export interface Cart {
  revision: number;
  id: string;
  customerId: string;
  items: CartItem[];
  total: number;
}

export interface CheckoutRequestInput {
  idempotencyKey: string;
  cartRevision: number;
  paymentProvider: PaymentProvider;
}

export interface CheckoutReplayResult {
  checkoutReplayed: true;
  order: Order;
  paymentProvider: PaymentProvider;
}

export type CheckoutRecoveryResult = CheckoutReplayResult | { checkoutNotCreated: true };
