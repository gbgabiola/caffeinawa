import { MAX_CART_ITEM_QUANTITY } from '@caffeinawa/types';
import { IsInt, IsUUID, Min, Max } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  coffeeId!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_CART_ITEM_QUANTITY)
  quantity!: number;
}
