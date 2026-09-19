import type { Order, OrderItem, OrderStatus } from '@caffeinawa/types';

export class OrderItemEntity implements OrderItem {
  id: string;
  coffeeId: string;
  quantity: number;
  unitPrice: number;

  constructor(data: OrderItem) {
    Object.assign(this, data);
  }
}

export class OrderEntity implements Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  createdAt: string;

  constructor(data: Order) {
    this.id = data.id;
    this.customerId = data.customerId;
    this.items = data.items.map((item) => new OrderItemEntity(item));
    this.status = data.status;
    this.total = data.total;
    this.createdAt = data.createdAt;
  }
}
