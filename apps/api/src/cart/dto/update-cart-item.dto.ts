import { MAX_CART_ITEM_QUANTITY } from '@caffeinawa/types';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_CART_ITEM_QUANTITY)
  quantity!: number;
}
