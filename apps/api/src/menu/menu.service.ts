import { Injectable } from '@nestjs/common';
import type { Coffee, CoffeeCategory } from '@caffeinawa/types';

import { CoffeeService } from '../coffee/coffee.service.js';
import { MenuItemEntity } from './entities/menu-item.entity.js';
import type { MenuQueryDto } from './dto/menu-query.dto.js';

@Injectable()
export class MenuService {
  constructor(private readonly coffeeService: CoffeeService) {}

  findAll(query: MenuQueryDto): Coffee[] {
    const coffees = this.coffeeService.findAll();

    return coffees
      .filter((coffee) => {
        if (query.category && coffee.category !== query.category) {
          return false;
        }

        if (
          query.available !== undefined &&
          coffee.available !== query.available
        ) {
          return false;
        }

        return true;
      })
      .map((coffee) => new MenuItemEntity(coffee));
  }

  findOne(id: string): Coffee {
    return new MenuItemEntity(this.coffeeService.findOne(id));
  }
}
