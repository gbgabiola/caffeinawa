import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

import { getAuthClientIp } from '../auth-client-ip.js';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(request: Request): Promise<string> {
    // Keep the throttler's IPv4/IPv6 normalization and subnet grouping.
    return super.getTracker({ ip: getAuthClientIp(request) });
  }
}
