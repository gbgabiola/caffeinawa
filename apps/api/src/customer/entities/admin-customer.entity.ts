import type { AdminCustomer } from '@caffeinawa/types';
import { CustomerEntity } from './customer.entity.js';

export class AdminCustomerEntity
  extends CustomerEntity
  implements AdminCustomer
{
  role: AdminCustomer['role'];

  constructor(data: AdminCustomer) {
    super(data);
    this.role = data.role;
  }
}
