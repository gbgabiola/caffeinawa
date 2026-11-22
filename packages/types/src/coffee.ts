export type CoffeeCategory =
  | 'espresso'
  | 'latte'
  | 'cappuccino'
  | 'americano'
  | 'cold_brew'
  | 'non_coffee';

export interface Coffee {
  id: string;
  name: string;
  description: string;
  category: CoffeeCategory;
  price: number;
  available: boolean;
  imageUrl?: string;
}

export const COFFEE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const COFFEE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
