import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Customer } from '@caffeinawa/types';

import { PrismaService } from '../database/prisma.service.js';
import { CustomerEntity } from './entities/customer.entity.js';
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

  async findAll(): Promise<Customer[]> {
    const customers = await this.prisma.customer.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    return customers.map((customer) => this.toEntity(customer));
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

    await this.prisma.customer.delete({
      where: { id },
    });
  }
}
