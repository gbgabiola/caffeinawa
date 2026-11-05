import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { AdminController } from './admin.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard.js';
import { AdminGuard } from './guards/admin.guard.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '15m',
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 10,
      },
    ]),
  ],
  controllers: [AuthController, AdminController],
  providers: [AuthService, AdminGuard, AuthThrottlerGuard],
  exports: [AuthService, JwtModule, AdminGuard, AuthThrottlerGuard, ThrottlerModule],
})
export class AuthModule {}
