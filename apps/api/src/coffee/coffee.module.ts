import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CoffeeController } from './coffee.controller.js';
import { CoffeeService } from './coffee.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CoffeeController],
  providers: [CoffeeService],
  exports: [CoffeeService],
})
export class CoffeeModule {}
