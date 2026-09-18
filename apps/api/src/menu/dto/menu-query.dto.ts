import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { CoffeeCategory } from '@caffeinawa/types';

const coffeeCategories: CoffeeCategory[] = [
  'espresso',
  'latte',
  'cappuccino',
  'americano',
  'cold_brew',
  'non_coffee',
];

function transformBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}

export class MenuQueryDto {
  @IsOptional()
  @IsIn(coffeeCategories)
  category?: CoffeeCategory;

  @IsOptional()
  @Transform(({ value }) => transformBoolean(value))
  @IsBoolean()
  available?: boolean;
}
