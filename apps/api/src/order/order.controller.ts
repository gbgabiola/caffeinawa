import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderService } from './order.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.orderService.findAllByCustomer(request.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.orderService.findOneByCustomer(id, request.user.sub);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateOrderDto) {
    return this.orderService.create(request.user.sub, dto);
  }
}
