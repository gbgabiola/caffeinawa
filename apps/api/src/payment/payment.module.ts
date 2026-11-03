import { Module } from '@nestjs/common';

import { CustomerPaymentController } from './customer-payment.controller.js';
import { PayMongoCheckoutService } from './paymongo-checkout.service.js';

import { AuthModule } from '../auth/auth.module.js';
import { AdminPaymentController } from './admin-payment.controller.js';
import { PaymentService } from './payment.service.js';
import { PayMongoService } from './paymongo.service.js';
import { PayMongoWebhookController } from './paymongo-webhook.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminPaymentController,
    PayMongoWebhookController,
    CustomerPaymentController,
  ],
  providers: [PaymentService, PayMongoService, PayMongoCheckoutService],
  exports: [PaymentService],
})
export class PaymentModule {}
