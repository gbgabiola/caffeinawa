import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js';
import { PayMongoCheckoutService } from './paymongo-checkout.service.js';

@Controller('orders/:orderId/payment-checkout')
@UseGuards(JwtAuthGuard)
export class CustomerPaymentController {
  constructor(private readonly checkout: PayMongoCheckoutService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  status(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.checkout.status(request.user.sub, orderId);
  }

  @Post('resume')
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  resume(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.checkout.resume(request.user.sub, orderId);
  }
}
