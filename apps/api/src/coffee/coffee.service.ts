import { Injectable } from '@nestjs/common';

@Injectable()
export class CoffeeService {
  private readonly coffees = [
    {
      id: '1',
      name: 'Caffeinawa Espresso',
      description: 'Rich and bold espresso.',
      price: 120,
      available: true,
    },
    {
      id: '2',
      name: 'Caffeinawa Latte',
      description: 'Smooth espresso with steamed milk.',
      price: 150,
      available: true,
    },
  ];

  findAll() {
    return this.coffees;
  }
}
