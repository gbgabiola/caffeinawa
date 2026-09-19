import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CustomerOwnerGuard } from '../auth/guards/customer-owner.guard.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

@Controller('customers/:customerId/cart')
@UseGuards(JwtAuthGuard, CustomerOwnerGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  findOne(@Param('customerId') customerId: string) {
    return this.cartService.findOne(customerId);
  }

  @Post('items')
  addItem(
    @Param('customerId') customerId: string,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(customerId, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @Param('customerId') customerId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(customerId, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(
    @Param('customerId') customerId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(customerId, itemId);
  }

  @Delete()
  clear(@Param('customerId') customerId: string) {
    return this.cartService.clear(customerId);
  }

  @Post('checkout')
  checkout(@Param('customerId') customerId: string) {
    return this.cartService.checkout(customerId);
  }
}
