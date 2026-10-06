import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toPaginatedResponse } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { CustomerEntity } from './entities/customer.entity.js';

import type { Customer } from '@caffeinawa/types';
import type { AdminCustomerQueryDto } from './dto/admin-customer-query.dto.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(customer: Customer): Customer {
    return new CustomerEntity(customer);
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Customer email already exists');
    }
    throw error;
  }

  async findAll(query: AdminCustomerQueryDto) {
    const { page, pageSize, search } = query;
    const where: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const total = await this.prisma.customer.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return toPaginatedResponse(
      customers.map((customer) => this.toEntity(customer)),
      normalizedPage,
      pageSize,
      total,
    );
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer "${id}" not found`);
    }

    return this.toEntity(customer);
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    try {
      const customer = await this.prisma.customer.create({
        data: {
          name: dto.name,
          email: dto.email,
        },
      });

      return this.toEntity(customer);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    await this.findOne(id);

    try {
      const customer = await this.prisma.customer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
        },
      });

      return this.toEntity(customer);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.customer.delete({ where: { id } });
  }
}
