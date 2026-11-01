import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { JwtAuthGuard } from './jwt-auth.guard.js';

const jwtService = new JwtService({
  secret: 'unit-test-jwt-secret',
});

function makeRequest(token: string) {
  const request: {
    headers: { authorization: string };
    user?: unknown;
  } = {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { request, context };
}

describe('JwtAuthGuard claims validation', () => {
  it.each(['CUSTOMER', 'ADMIN'])('accepts valid %s claims', async (role) => {
    const payload = {
      sub: 'customer-1',
      email: 'customer@example.com',
      role,
    };

    const token = await jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    const { request, context } = makeRequest(token);
    const guard = new JwtAuthGuard(jwtService);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toMatchObject(payload);
  });

  it.each([
    {},
    { sub: 'customer-1' },
    {
      sub: '',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    },
    {
      sub: '   ',
      email: 'customer@example.com',
      role: 'CUSTOMER',
    },
    {
      sub: 123,
      email: 'customer@example.com',
      role: 'CUSTOMER',
    },
    {
      sub: 'customer-1',
      email: '',
      role: 'CUSTOMER',
    },
    {
      sub: 'customer-1',
      email: 'customer@example.com',
      role: 'SUPERADMIN',
    },
  ])('rejects signed tokens with invalid claims: %o', async (payload) => {
    const token = await jwtService.signAsync(payload, {
      expiresIn: '15m',
    });

    const { request, context } = makeRequest(token);
    const guard = new JwtAuthGuard(jwtService);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(request.user).toBeUndefined();
  });

  it('rejects a token signed with another algorithm', async () => {
    const token = await jwtService.signAsync(
      {
        sub: 'customer-1',
        email: 'customer@example.com',
        role: 'CUSTOMER',
      },
      {
        algorithm: 'HS384',
        expiresIn: '15m',
      },
    );

    const { context } = makeRequest(token);
    const guard = new JwtAuthGuard(jwtService);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
