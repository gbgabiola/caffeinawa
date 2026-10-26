import { Controller, Get, Header } from '@nestjs/common';

import { StoreService } from './store.service.js';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('ordering')
  @Header('Cache-Control', 'no-store')
  getOrdering() {
    return this.storeService.getOrdering();
  }
}
