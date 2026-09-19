import type { Customer } from '@caffeinawa/types';

export class CustomerEntity implements Customer {
  id: string;
  name: string;
  email: string;

  constructor(data: Customer) {
    Object.assign(this, data);
  }
}
