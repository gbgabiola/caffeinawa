import type { CoffeeCategory } from '@caffeinawa/types';

export class UpdateCoffeeDto {
  name?: string;
  description?: string;
  category?: CoffeeCategory;
  price?: number;
  available?: boolean;
  imageUrl?: string;
}
