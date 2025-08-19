import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as ProcurementClient } from '@prisma/procurement';
import { PrismaClient as OrderClient } from '@prisma/scmorder';
import { PrismaClient as BasicClient } from '@prisma/scmbasic';
import { PrismaClient as PricingClient } from '@prisma/scmpricing';
import { PrismaClient as InventoryClient } from '@prisma/inventory';
import { PrismaClient as ImbasicClient } from '@prisma/imbasic';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  procurement: ProcurementClient;
  order: OrderClient;
  imbasic: ImbasicClient;
  basic: BasicClient;
  pricing: PricingClient;
  inventory: InventoryClient;

  constructor() {
    this.procurement = new ProcurementClient();
    this.order = new OrderClient();
    this.imbasic = new ImbasicClient();
    this.basic = new BasicClient();
    this.pricing = new PricingClient();
    this.inventory = new InventoryClient();
  }

  async onModuleInit() {
    await Promise.all([
      this.procurement.$connect(),
      this.order.$connect(),
      this.imbasic.$connect(),
      this.basic.$connect(),
      this.pricing.$connect(),
      this.inventory.$connect(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.procurement.$disconnect(),
      this.order.$disconnect(),
      this.imbasic.$disconnect(),
      this.basic.$disconnect(),
      this.pricing.$disconnect(),
      this.inventory.$disconnect(),
    ]);
  }
}
