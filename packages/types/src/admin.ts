import type { Order } from './order.js';
import type { Payment } from './payment.js';

export interface AdminCustomerSummary {
  id: string;
  name: string;
  email: string;
}

export interface AdminOrder extends Order {
  customer: AdminCustomerSummary;
}

export interface AdminPaymentOrderItem {
  coffeeName: string;
  quantity: number;
  unitPrice: number;
}

export interface AdminPaymentOrder {
  customer: AdminCustomerSummary;
  items: AdminPaymentOrderItem[];
}

export interface AdminPayment extends Payment {
  order: AdminPaymentOrder;
}
