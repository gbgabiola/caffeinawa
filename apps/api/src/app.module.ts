import { Module } from '@nestjs/common';

import { CoffeeModule } from './coffee/coffee.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { DatabaseModule } from './database/database.module.js';
import { MenuModule } from './menu/menu.module.js';
import { OrderModule } from './order/order.module.js';
import { CartModule } from './cart/cart.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    DatabaseModule,
    CoffeeModule,
    MenuModule,
    CustomerModule,
    OrderModule,
    CartModule,
    AuthModule,
  ],
})
export class AppModule {}
