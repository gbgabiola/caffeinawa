import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CoffeeService } from './coffee.service.js';
import { AdminCoffeeQueryDto } from './dto/admin-coffee-query.dto.js';
import { CreateCoffeeDto } from './dto/create-coffee.dto.js';
import { UpdateCoffeeDto } from './dto/update-coffee.dto.js';

@Controller('admin/coffees')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCoffeeController {
  constructor(private readonly coffeeService: CoffeeService) {}
  @Get()
  findAll(@Query() query: AdminCoffeeQueryDto) {
    return this.coffeeService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coffeeService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCoffeeDto) {
    return this.coffeeService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCoffeeDto) {
    return this.coffeeService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.coffeeService.remove(id);
  }
}
