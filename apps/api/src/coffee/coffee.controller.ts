import { Controller, Get } from '@nestjs/common';
import { CoffeeService } from './coffee.service.js';

@Controller('coffees')
export class CoffeeController {
  constructor(private readonly coffeeService: CoffeeService) {}

  @Get()
  findAll() {
    return this.coffeeService.findAll();
  }
}
