import type { Customer } from '@caffeinawa/types';

export class CustomerEntity implements Customer {
  id: string;
  name: string;
  email: string;

  constructor(data: Customer) {
    this.id = data.id;
    this.name = data.name;
    this.email = data.email;
  }
}
