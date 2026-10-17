import { PaymentIssueStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class PaymentIssueQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PaymentIssueStatus)
  status?: PaymentIssueStatus;
}
