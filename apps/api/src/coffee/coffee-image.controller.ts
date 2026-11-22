import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CoffeeImageBodyInterceptor } from './coffee-image-body.interceptor.js';
import { CoffeeImageService } from './coffee-image.service.js';

@Controller('admin/coffee-images')
@UseGuards(JwtAuthGuard, AdminGuard)
export class CoffeeImageController {
  constructor(private readonly images: CoffeeImageService) {}

  @Get('status')
  status() {
    return { enabled: this.images.isEnabled() };
  }

  @Post(':coffeeId')
  @HttpCode(200)
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(CoffeeImageBodyInterceptor)
  upload(
    @Param('coffeeId', new ParseUUIDPipe({ version: '4' })) coffeeId: string,
    @Req() request: Request,
  ) {
    return this.images.attach(coffeeId, request.body as unknown);
  }
}
