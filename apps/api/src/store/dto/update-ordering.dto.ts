import { IsBoolean } from 'class-validator';

export class UpdateOrderingDto {
  @IsBoolean()
  acceptingOrders!: boolean;
}
