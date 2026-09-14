import { Module } from '@nestjs/common';
import { CoffeeModule } from './coffee/coffee.module.js';

@Module({
  imports: [CoffeeModule],
})
export class AppModule {}
