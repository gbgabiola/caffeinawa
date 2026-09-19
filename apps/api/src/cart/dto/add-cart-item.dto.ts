import { IsInt, IsUUID, Min } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  coffeeId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
