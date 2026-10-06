import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

const PAYMENT_PROVIDERS = ['cash', 'paymongo'] as const;
const PAYMENT_STATUSES = [
  'pending',
  'paid',
  'failed',
  'expired',
  'cancelled',
] as const;

export class AdminPaymentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_PROVIDERS)
  provider?: (typeof PAYMENT_PROVIDERS)[number];

  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];
}
