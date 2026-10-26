import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { PaymentModule } from '../payment/payment.module.js';
import { StoreModule } from '../store/store.module.js';

@Module({
  imports: [AuthModule, PaymentModule, StoreModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
