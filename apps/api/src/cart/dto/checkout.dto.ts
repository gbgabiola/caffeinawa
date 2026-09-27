import { IsIn, IsOptional } from 'class-validator';

export class CheckoutDto {
  @IsOptional()
  @IsIn(['cash'])
  paymentProvider?: 'cash';
}
