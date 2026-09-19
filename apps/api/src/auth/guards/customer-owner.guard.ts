import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class CustomerOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authenticatedCustomerId = request.user?.sub;
    const requestedCustomerId = request.params.customerId;

    if (
      !authenticatedCustomerId ||
      authenticatedCustomerId !== requestedCustomerId
    ) {
      throw new ForbiddenException(
        'You cannot access another customer account',
      );
    }

    return true;
  }
}
