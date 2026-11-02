import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { Request } from 'express';

import type { JwtPayload } from '../types/jwt-payload.js';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.sub === 'string' &&
    payload.sub.trim().length > 0 &&
    typeof payload.email === 'string' &&
    payload.email.trim().length > 0 &&
    (payload.role === 'CUSTOMER' || payload.role === 'ADMIN') &&
    typeof payload.exp === 'number' &&
    Number.isSafeInteger(payload.exp) &&
    payload.exp > 0
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required');
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload: unknown = await this.jwtService.verifyAsync(token, {
        algorithms: ['HS256'],
      });

      if (!isJwtPayload(payload)) {
        throw new UnauthorizedException('Invalid access token claims');
      }

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
