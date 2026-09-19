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

import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CoffeeService } from './coffee.service.js';
import { CreateCoffeeDto } from './dto/create-coffee.dto.js';
import { UpdateCoffeeDto } from './dto/update-coffee.dto.js';

@Controller('coffees')
export class CoffeeController {
  constructor(private readonly coffeeService: CoffeeService) {}

  @Get()
  findAll() {
    return this.coffeeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coffeeService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() dto: CreateCoffeeDto) {
    return this.coffeeService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateCoffeeDto) {
    return this.coffeeService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id') id: string) {
    return this.coffeeService.remove(id);
  }
}
