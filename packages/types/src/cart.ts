import type { Coffee } from './coffee.js';

export interface CartItem {
  id: string;
  coffeeId: string;
  coffee: Pick<Coffee, 'id' | 'name' | 'price' | 'available' | 'imageUrl'>;
  quantity: number;
  subtotal: number;
}

export interface Cart {
  id: string;
  customerId: string;
  items: CartItem[];
  total: number;
}
