import type { CoffeeCategory } from '@caffeinawa/types';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

const coffeeCategories: CoffeeCategory[] = [
  'espresso',
  'latte',
  'cappuccino',
  'americano',
  'cold_brew',
  'non_coffee',
];

export class MenuQueryDto {
  @IsOptional()
  @IsIn(coffeeCategories)
  category?: CoffeeCategory;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  available?: boolean;
}
