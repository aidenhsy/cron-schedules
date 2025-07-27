import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ChecksService {
  private readonly logger = new Logger(
    `${ChecksService.name}-checkDifferentOrders`,
  );
  constructor(private readonly databaseService: DatabaseService) {}

  @Cron('42 8 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkDifferentOrders() {
    this.logger.log('Checking different orders');
    const scmOrders =
      await this.databaseService.order.procurement_orders.findMany();

    const procurementOrders =
      await this.databaseService.procurement.supplier_orders.findMany();

    const missingScmOrders = procurementOrders.filter(
      (procurementOrder) =>
        !scmOrders.some(
          (scmOrder) => scmOrder.client_order_id === procurementOrder.id,
        ),
    );

    const missingProcurementOrders = scmOrders.filter(
      (scmOrder) =>
        !procurementOrders.some(
          (procurementOrder) =>
            procurementOrder.id === scmOrder.client_order_id,
        ),
    );

    if (missingScmOrders.length > 0) {
      this.logger.warn(
        `Missing SCM orders: ${missingScmOrders.length}`,
        missingScmOrders.map((order) => order.client_order_id),
      );
    }

    if (missingProcurementOrders.length > 0) {
      this.logger.warn(
        `Missing procurement orders: ${missingProcurementOrders.length}`,
        missingProcurementOrders.map((order) => order.id),
      );
    }
  }
}
