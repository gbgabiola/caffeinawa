import type { Cart, CartItem } from '@caffeinawa/types';

export class CartItemEntity implements CartItem {
  id: string;
  coffeeId: string;
  coffee: CartItem['coffee'];
  quantity: number;
  subtotal: number;

  constructor(data: CartItem) {
    Object.assign(this, data);
  }
}

export class CartEntity implements Cart {
  revision: number;
  id: string;
  customerId: string;
  items: CartItem[];
  total: number;

  constructor(data: Cart) {
    this.revision = data.revision;
    this.id = data.id;
    this.customerId = data.customerId;
    this.items = data.items.map((item) => new CartItemEntity(item));
    this.total = data.total;
  }
}
