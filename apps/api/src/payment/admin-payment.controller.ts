import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminPaymentQueryDto } from './dto/admin-payment-query.dto.js';
import { PaymentReconciliationQueryDto } from './dto/payment-reconciliation-query.dto.js';
import { PaymentService } from './payment.service.js';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  findAll(@Query() query: AdminPaymentQueryDto) {
    return this.paymentService.findAll(query);
  }

  @Get('reconciliation')
  findReconciliationCandidates(@Query() query: PaymentReconciliationQueryDto) {
    return this.paymentService.findReconciliationCandidates(query);
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
