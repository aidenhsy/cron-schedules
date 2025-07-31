import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(`${InventoryService.name}`);
  constructor(private readonly databaseService: DatabaseService) {}

  @Cron('0 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async finalOrders() {}
}
