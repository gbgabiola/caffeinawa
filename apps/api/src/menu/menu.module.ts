import { Module } from '@nestjs/common';

import { CoffeeModule } from '../coffee/coffee.module.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';

@Module({
  imports: [CoffeeModule],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
