export type CoffeeCategory = 'espresso' | 'latte' | 'cappuccino' | 'cold_brew' | 'non_coffee';

export interface Coffee {
  id: string;
  name: string;
  description: string;
  category: CoffeeCategory;
  price: number;
  available: boolean;
  imageUrl?: string;
}
