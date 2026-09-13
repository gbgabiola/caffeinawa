import { Module } from '@nestjs/common';
import { CoffeeController } from './coffee.controller.js';
import { CoffeeService } from './coffee.service.js';

@Module({
  controllers: [CoffeeController],
  providers: [CoffeeService]
})
export class CoffeeModule {}
