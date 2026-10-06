import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

const COFFEE_CATEGORIES = [
  'espresso',
  'latte',
  'cappuccino',
  'americano',
  'cold_brew',
  'non_coffee',
] as const;

export class AdminCoffeeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(COFFEE_CATEGORIES)
  category?: (typeof COFFEE_CATEGORIES)[number];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  available?: boolean;
}
