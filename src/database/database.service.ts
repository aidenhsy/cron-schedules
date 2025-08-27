import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as ProcurementClient } from '@prisma/procurement';
import { PrismaClient as OrderClient } from '@prisma/scmorder';
import { PrismaClient as BasicClient } from '@prisma/scmbasic';
import { PrismaClient as PricingClient } from '@prisma/scmpricing';
import { PrismaClient as InventoryClient } from '@prisma/inventory';
import { PrismaClient as ImbasicClient } from '@prisma/imbasic';

import { PrismaClient as DevProcurementClient } from '@prisma/dev-procurement';
import { PrismaClient as DevOrderClient } from '@prisma/dev-scmorder';
import { PrismaClient as DevImbasicClient } from '@prisma/dev-imbasic';
import { PrismaClient as DevBasicClient } from '@prisma/dev-scmbasic';
import { PrismaClient as DevPricingClient } from '@prisma/dev-scmpricing';
import { PrismaClient as DevInventoryClient } from '@prisma/dev-inventory';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  procurement: ProcurementClient;
  order: OrderClient;
  imbasic: ImbasicClient;
  basic: BasicClient;
  pricing: PricingClient;
  inventory: InventoryClient;

  devProcurement: DevProcurementClient;
  devOrder: DevOrderClient;
  devImbasic: DevImbasicClient;
  devBasic: DevBasicClient;
  devPricing: DevPricingClient;
  devInventory: DevInventoryClient;

  constructor() {
    this.procurement = new ProcurementClient();
    this.order = new OrderClient();
    this.imbasic = new ImbasicClient();
    this.basic = new BasicClient();
    this.pricing = new PricingClient();
    this.inventory = new InventoryClient();

    this.devProcurement = new DevProcurementClient();
    this.devOrder = new DevOrderClient();
    this.devImbasic = new DevImbasicClient();
    this.devBasic = new DevBasicClient();
    this.devPricing = new DevPricingClient();
    this.devInventory = new DevInventoryClient();
  }

  async onModuleInit() {
    await Promise.all([
      this.procurement.$connect(),
      this.order.$connect(),
      this.imbasic.$connect(),
      this.basic.$connect(),
      this.pricing.$connect(),
      this.inventory.$connect(),

      this.devProcurement.$connect(),
      this.devOrder.$connect(),
      this.devImbasic.$connect(),
      this.devBasic.$connect(),
      this.devPricing.$connect(),
      this.devInventory.$connect(),
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

      this.devProcurement.$disconnect(),
      this.devOrder.$disconnect(),
      this.devImbasic.$disconnect(),
      this.devBasic.$disconnect(),
      this.devPricing.$disconnect(),
      this.devInventory.$disconnect(),
    ]);
  }
}
