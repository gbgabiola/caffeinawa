import type { Coffee } from '@caffeinawa/types';

export class MenuItemEntity implements Coffee {
  id: string;
  name: string;
  description: string;
  category: Coffee['category'];
  price: number;
  available: boolean;
  imageUrl?: string;

  constructor(coffee: Coffee) {
    this.id = coffee.id;
    this.name = coffee.name;
    this.description = coffee.description;
    this.category = coffee.category;
    this.price = coffee.price;
    this.available = coffee.available;
    this.imageUrl = coffee.imageUrl;
  }
}
