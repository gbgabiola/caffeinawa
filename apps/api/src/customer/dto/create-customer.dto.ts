import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;
}
