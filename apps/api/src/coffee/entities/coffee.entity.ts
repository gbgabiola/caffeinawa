import type { Coffee } from '@caffeinawa/types';

export class CoffeeEntity implements Coffee {
  id: string;
  name: string;
  description: string;
  category: Coffee['category'];
  price: number;
  available: boolean;
  imageUrl?: string;

  constructor(data: Coffee) {
    Object.assign(this, data);
  }
}
