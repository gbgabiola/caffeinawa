import { IsIn, IsOptional } from 'class-validator';

export class CheckoutDto {
  @IsOptional()
  @IsIn(['cash', 'paymongo'])
  paymentProvider?: 'cash' | 'paymongo';
}
