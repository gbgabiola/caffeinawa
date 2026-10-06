import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CoffeeCategory as PrismaCoffeeCategory } from '@prisma/client';

import { toPaginatedResponse } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { CoffeeEntity } from './entities/coffee.entity.js';

import type { Coffee, PaginatedResponse } from '@caffeinawa/types';
import type { AdminCoffeeQueryDto } from './dto/admin-coffee-query.dto.js';
import type { CreateCoffeeDto } from './dto/create-coffee.dto.js';
import type { UpdateCoffeeDto } from './dto/update-coffee.dto.js';

@Injectable()
export class CoffeeService {
  constructor(private readonly prisma: PrismaService) {}
  private toEntity(coffee: {
    id: string;
    name: string;
    description: string;
    category: PrismaCoffeeCategory;
    price: { toNumber(): number };
    available: boolean;
    imageUrl: string | null;
  }): Coffee {
    return new CoffeeEntity({
      id: coffee.id,
      name: coffee.name,
      description: coffee.description,
      category: coffee.category as Coffee['category'],
      price: coffee.price.toNumber(),
      available: coffee.available,
      imageUrl: coffee.imageUrl ?? undefined,
    });
  }

  async findAll(): Promise<Coffee[]>;
  async findAll(query: AdminCoffeeQueryDto): Promise<PaginatedResponse<Coffee>>;
  async findAll(query?: AdminCoffeeQueryDto) {
    if (!query) {
      const coffees = await this.prisma.coffee.findMany({
        orderBy: { createdAt: 'asc' },
      });

      return coffees.map((coffee) => this.toEntity(coffee));
    }
    const { page, pageSize, search, category, available } = query;
    const where: Prisma.CoffeeWhereInput = {
      ...(category && { category: category as PrismaCoffeeCategory }),
      ...(available !== undefined && { available }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const total = await this.prisma.coffee.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const coffees = await this.prisma.coffee.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    });

    return toPaginatedResponse(
      coffees.map((coffee) => this.toEntity(coffee)),
      normalizedPage,
      pageSize,
      total,
    );
  }

  async findOne(id: string): Promise<Coffee> {
    const coffee = await this.prisma.coffee.findUnique({ where: { id } });
    if (!coffee) {
      throw new NotFoundException(`Coffee "${id}" not found`);
    }

    return this.toEntity(coffee);
  }

  async create(dto: CreateCoffeeDto): Promise<Coffee> {
    const coffee = await this.prisma.coffee.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category as PrismaCoffeeCategory,
        price: dto.price,
        available: dto.available ?? true,
        imageUrl: dto.imageUrl,
      },
    });

    return this.toEntity(coffee);
  }

  async update(id: string, dto: UpdateCoffeeDto): Promise<Coffee> {
    await this.findOne(id);
    const coffee = await this.prisma.coffee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && {
          category: dto.category as PrismaCoffeeCategory,
        }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.available !== undefined && { available: dto.available }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      },
    });

    return this.toEntity(coffee);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    try {
      await this.prisma.coffee.delete({ where: { id } });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Coffee cannot be deleted because it is referenced by an existing order',
        );
      }
      throw error;
    }
  }
}
