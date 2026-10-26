import { Body, Controller, Patch, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UpdateOrderingDto } from './dto/update-ordering.dto.js';
import { StoreService } from './store.service.js';

@Controller('admin/store')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminStoreController {
  constructor(private readonly storeService: StoreService) {}

  @Patch('ordering')
  updateOrdering(@Body() dto: UpdateOrderingDto) {
    return this.storeService.setOrdering(dto.acceptingOrders);
  }
}
