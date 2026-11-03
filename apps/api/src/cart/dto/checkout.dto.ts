import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CheckoutDto {
  @IsUUID('4', { message: 'Refresh checkout before placing your order.' })
  idempotencyKey: string;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  cartRevision: number;

  @IsOptional()
  @IsIn(['cash', 'paymongo'])
  paymentProvider?: 'cash' | 'paymongo';
}
