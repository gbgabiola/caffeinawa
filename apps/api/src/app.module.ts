import { Module } from '@nestjs/common';

import { CoffeeModule } from './coffee/coffee.module.js';
import { MenuModule } from './menu/menu.module.js';

@Module({
  imports: [CoffeeModule, MenuModule],
})
export class AppModule {}
