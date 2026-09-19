import { Module } from '@nestjs/common';

import { CoffeeModule } from './coffee/coffee.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { DatabaseModule } from './database/database.module.js';
import { MenuModule } from './menu/menu.module.js';

@Module({
  imports: [DatabaseModule, CoffeeModule, MenuModule, CustomerModule],
})
export class AppModule {}
