import type { CoffeeCategory } from '@caffeinawa/types';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const coffeeCategories: CoffeeCategory[] = [
  'espresso',
  'latte',
  'cappuccino',
  'americano',
  'cold_brew',
  'non_coffee',
];

export class UpdateCoffeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(coffeeCategories)
  category?: CoffeeCategory;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
