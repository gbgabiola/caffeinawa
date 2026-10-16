import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class PaymentReconciliationQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  ageHours = 24;
}
