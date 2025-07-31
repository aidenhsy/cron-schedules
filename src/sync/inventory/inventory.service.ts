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

  @Cron('35 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async syncSupplierItems() {
    const procurementSupplierItems =
      await this.databaseService.procurement.supplier_items.findMany();

    const inventorySupplierItems =
      await this.databaseService.inventory.supplier_items.findMany();

    const missingInventorySupplierItems = procurementSupplierItems.filter(
      (item) =>
        !inventorySupplierItems.some((i) => i.supplier_id === item.supplier_id),
    );

    if (missingInventorySupplierItems.length > 0) {
      this.logger.log(
        `Missing inventory supplier items: ${missingInventorySupplierItems.length}`,
      );

      for (const item of missingInventorySupplierItems) {
        await this.databaseService.inventory.supplier_items.create({
          data: item,
        });
      }
    }
  }
}
