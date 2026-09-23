import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AdminCustomerController } from './admin-customer.controller.js';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CustomerController, AdminCustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
