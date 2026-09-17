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

export class CreateCoffeeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  description!: string;

  @IsIn(coffeeCategories)
  category!: CoffeeCategory;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
