import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AdminCoffeeController } from './admin-coffee.controller.js';
import { CoffeeImageController } from './coffee-image.controller.js';
import { CoffeeImageService } from './coffee-image.service.js';
import { CoffeeImageBodyInterceptor } from './coffee-image-body.interceptor.js';
import { CoffeeController } from './coffee.controller.js';
import { CoffeeService } from './coffee.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CoffeeController, AdminCoffeeController, CoffeeImageController],
  providers: [CoffeeService, CoffeeImageService, CoffeeImageBodyInterceptor],
  exports: [CoffeeService],
})
export class CoffeeModule {}
