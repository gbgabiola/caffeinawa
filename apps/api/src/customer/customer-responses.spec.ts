import {
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PrismaService } from '../database/prisma.service.js';
import { AdminCustomerController } from './admin-customer.controller.js';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

describe('Customer HTTP response contracts', () => {
  let app: INestApplication;
  let callerRole: 'ADMIN' | 'CUSTOMER';
  const record = {
    id: 'customer-1',
    name: 'Test Customer',
    email: 'customer@example.test',
    role: 'ADMIN' as const,
    passwordHash: 'private-hash',
    internalNotes: 'private-notes',
  };
  const publicCustomer = {
    id: record.id,
    name: record.name,
    email: record.email,
  };
  const prisma = {
    customer: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    callerRole = 'ADMIN';
    prisma.customer.count.mockResolvedValue(1);
    prisma.customer.findMany.mockResolvedValue([record]);
    prisma.customer.findUnique.mockResolvedValue(record);
    prisma.customer.update.mockResolvedValue({
      ...record,
      name: 'Updated Customer',
    });
    const module = await Test.createTestingModule({
      controllers: [CustomerController, AdminCustomerController],
      providers: [
        CustomerService,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            sub: record.id,
            role: callerRole,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it.each(['ADMIN', 'CUSTOMER'] as const)(
    'includes the stored %s role in admin lists',
    async (role) => {
      prisma.customer.findMany.mockResolvedValue([{ ...record, role }]);
      const response = await request(app.getHttpServer())
        .get('/api/admin/customers')
        .expect(200);
      expect(response.body).toEqual({
        data: [{ ...publicCustomer, role }],
        meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      });
    },
  );

  it('includes role and only allowed fields in admin detail responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/customers/customer-1')
      .expect(200);
    expect(response.body).toEqual({ ...publicCustomer, role: 'ADMIN' });
  });

  it('includes the stored role after an admin profile edit', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/customers/customer-1')
      .send({ name: 'Updated Customer' })
      .expect(200);
    expect(response.body).toEqual({
      ...publicCustomer,
      name: 'Updated Customer',
      role: 'ADMIN',
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: { name: 'Updated Customer' },
    });
  });

  it('preserves the public profile GET response', async () => {
    callerRole = 'CUSTOMER';
    const response = await request(app.getHttpServer())
      .get('/api/customers/me')
      .expect(200);
    expect(response.body).toEqual(publicCustomer);
  });

  it('preserves the public profile PATCH response', async () => {
    callerRole = 'CUSTOMER';
    const response = await request(app.getHttpServer())
      .patch('/api/customers/me')
      .send({ name: 'Updated Customer' })
      .expect(200);
    expect(response.body).toEqual({
      ...publicCustomer,
      name: 'Updated Customer',
    });
  });

  it('rejects role changes through profile editing', async () => {
    await request(app.getHttpServer())
      .patch('/api/admin/customers/customer-1')
      .send({ role: 'ADMIN' })
      .expect(400);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('keeps non-admin callers out of admin customer routes', async () => {
    callerRole = 'CUSTOMER';
    await request(app.getHttpServer()).get('/api/admin/customers').expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/customers/customer-1')
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/admin/customers/customer-1')
      .send({ name: 'Updated Customer' })
      .expect(403);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('preserves missing-customer errors in admin routes', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/api/admin/customers/missing')
      .expect(404);
    await request(app.getHttpServer())
      .patch('/api/admin/customers/missing')
      .send({ name: 'Updated Customer' })
      .expect(404);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });
});
