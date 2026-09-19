import { Injectable } from '@nestjs/common';
import type { Coffee } from '@caffeinawa/types';

import { CoffeeService } from '../coffee/coffee.service.js';
import type { MenuQueryDto } from './dto/menu-query.dto.js';
import { MenuItemEntity } from './entities/menu-item.entity.js';

@Injectable()
export class MenuService {
  constructor(private readonly coffeeService: CoffeeService) {}

  async findAll(query: MenuQueryDto): Promise<MenuItemEntity[]> {
    let coffees: Coffee[] = await this.coffeeService.findAll();

    if (query.category) {
      coffees = coffees.filter((coffee) => coffee.category === query.category);
    }

    if (query.available !== undefined) {
      coffees = coffees.filter(
        (coffee) => coffee.available === query.available,
      );
    }

    return coffees.map((coffee) => new MenuItemEntity(coffee));
  }

  async findOne(id: string): Promise<MenuItemEntity> {
    const coffee = await this.coffeeService.findOne(id);

    return new MenuItemEntity(coffee);
  }
}
