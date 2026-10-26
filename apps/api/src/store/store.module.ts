import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AdminStoreController } from './admin-store.controller.js';
import { StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [StoreController, AdminStoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
