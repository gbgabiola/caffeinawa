import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminOrderQueryDto } from './dto/admin-order-query.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrderService } from './order.service.js';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.orderService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orderService.update(id, dto);
  }
}
