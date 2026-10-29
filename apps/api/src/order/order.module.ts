import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AdminOrderController } from './admin-order.controller.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
