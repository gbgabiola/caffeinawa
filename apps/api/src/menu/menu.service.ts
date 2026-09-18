import { Injectable } from '@nestjs/common';
import type { Coffee, CoffeeCategory } from '@caffeinawa/types';

import { CoffeeService } from '../coffee/coffee.service.js';
import { MenuItemEntity } from './entities/menu-item.entity.js';
import type { MenuQueryDto } from './dto/menu-query.dto.js';

@Injectable()
export class MenuService {
  constructor(private readonly coffeeService: CoffeeService) {}

  findAll(query: MenuQueryDto): MenuItemEntity[] {
    let coffees = this.coffeeService.findAll();

    if (query.category !== undefined) {
      coffees = coffees.filter((coffee) => coffee.category === query.category);
    }

    if (query.available !== undefined) {
      coffees = coffees.filter(
        (coffee) => coffee.available === query.available,
      );
    }

    return coffees.map((coffee) => new MenuItemEntity(coffee));
  }

  findOne(id: string): MenuItemEntity {
    const coffee = this.coffeeService.findOne(id);

    return new MenuItemEntity(coffee);
  }
}
