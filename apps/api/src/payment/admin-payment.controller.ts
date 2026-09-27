import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaymentService } from './payment.service.js';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  findAll() {
    return this.paymentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentService.findOne(id);
  }

  @Patch(':id/mark-paid')
  markAsPaid(@Param('id') id: string) {
    return this.paymentService.markCashPaymentAsPaid(id);
  }
}
