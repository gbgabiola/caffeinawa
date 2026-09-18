import { Controller, Get, Param, Query } from '@nestjs/common';

import { MenuService } from './menu.service.js';
import { MenuQueryDto } from './dto/menu-query.dto.js';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  findAll(@Query() query: MenuQueryDto) {
    return this.menuService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.menuService.findOne(id);
  }
}
