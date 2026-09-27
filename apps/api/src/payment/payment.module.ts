import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PaymentService } from './payment.service.js';
import { AdminPaymentController } from './admin-payment.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminPaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
