import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor() {}

  async onModuleInit() {
    await Promise.all([
      // this.procurement.$connect(),
      // this.order.$connect(),
      // this.imbasic.$connect(),
      // this.basic.$connect(),
      // this.pricing.$connect(),
      // this.inventory.$connect(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all([]);
  }
}
