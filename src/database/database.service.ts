import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as ProcurementClient } from '@prisma/procurement';
import { PrismaClient as OrderClient } from '@prisma/scmorder';
import { PrismaClient as BasicClient } from '@prisma/scmbasic';
import { PrismaClient as PricingClient } from '@prisma/scmpricing';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  procurement: ProcurementClient;
  order: OrderClient;
  basic: BasicClient;
  pricing: PricingClient;

  constructor() {
    this.procurement = new ProcurementClient();
    this.order = new OrderClient();
    this.basic = new BasicClient();
    this.pricing = new PricingClient();
  }

  async onModuleInit() {
    await Promise.all([
      this.procurement.$connect(),
      this.order.$connect(),
      this.basic.$connect(),
      this.pricing.$connect(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.procurement.$disconnect(),
      this.order.$disconnect(),
      this.basic.$disconnect(),
      this.pricing.$disconnect(),
    ]);
  }
}
