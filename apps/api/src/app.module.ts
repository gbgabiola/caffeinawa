import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { CartModule } from './cart/cart.module.js';
import { CoffeeModule } from './coffee/coffee.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { MenuModule } from './menu/menu.module.js';
import { OrderModule } from './order/order.module.js';
import { PaymentModule } from './payment/payment.module.js';
import { StoreModule } from './store/store.module.js';

@Module({
  imports: [
    DatabaseModule,
    CoffeeModule,
    MenuModule,
    CustomerModule,
    OrderModule,
    CartModule,
    AuthModule,
    PaymentModule,
    StoreModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
