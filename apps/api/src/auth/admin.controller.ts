import { Controller, Get, UseGuards } from '@nestjs/common';

import { AdminGuard } from './guards/admin.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  @Get('health')
  health() {
    return {
      message: 'Admin access verified',
    };
  }
}
