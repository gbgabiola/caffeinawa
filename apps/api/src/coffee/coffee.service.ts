import { Injectable, NotFoundException } from '@nestjs/common';
import type { Coffee } from '@caffeinawa/types';

import { CoffeeEntity } from './entities/coffee.entity.js';
import type { CreateCoffeeDto } from './dto/create-coffee.dto.js';
import type { UpdateCoffeeDto } from './dto/update-coffee.dto.js';

@Injectable()
export class CoffeeService {
  private readonly coffees: CoffeeEntity[] = [
    new CoffeeEntity({
      id: 'coffee-001',
      name: 'Caffeinawa Espresso',
      description: 'Rich and bold espresso with a smooth finish.',
      category: 'espresso',
      price: 120,
      available: true,
    }),

    new CoffeeEntity({
      id: 'coffee-002',
      name: 'Caffeinawa Latte',
      description: 'Smooth espresso blended with steamed milk.',
      category: 'latte',
      price: 150,
      available: true,
    }),

    new CoffeeEntity({
      id: 'coffee-003',
      name: 'Caffeinawa Cold Brew',
      description: 'Slow-brewed coffee served chilled.',
      category: 'cold_brew',
      price: 160,
      available: true,
    }),
  ];

  findAll(): Coffee[] {
    return this.coffees;
  }

  findOne(id: string): Coffee {
    const coffee = this.coffees.find((item) => item.id === id);

    if (!coffee) {
      throw new NotFoundException(`Coffee "${id}" not found`);
    }

    return coffee;
  }

  create(dto: CreateCoffeeDto): Coffee {
    const coffee = new CoffeeEntity({
      id: crypto.randomUUID(),
      name: dto.name,
      description: dto.description,
      category: dto.category,
      price: dto.price,
      available: dto.available ?? true,
      imageUrl: dto.imageUrl,
    });

    this.coffees.push(coffee);

    return coffee;
  }

  update(id: string, dto: UpdateCoffeeDto): Coffee {
    const coffee = this.findOne(id);

    Object.assign(coffee, dto);

    return coffee;
  }

  remove(id: string): void {
    const index = this.coffees.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Coffee "${id}" not found`);
    }

    this.coffees.splice(index, 1);
  }
}
