import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { PaymentModule } from '../payment/payment.module.js';

@Module({
  imports: [AuthModule, PaymentModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
