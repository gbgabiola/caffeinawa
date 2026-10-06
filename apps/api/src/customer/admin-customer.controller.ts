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
import { CustomerService } from './customer.service.js';
import { AdminCustomerQueryDto } from './dto/admin-customer-query.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';

@Controller('admin/customers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findAll(@Query() query: AdminCustomerQueryDto) {
    return this.customerService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customerService.update(id, dto);
  }
}
