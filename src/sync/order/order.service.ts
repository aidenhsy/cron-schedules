import { Injectable } from '@nestjs/common';
import { BaseError } from '@saihu/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class OrderService {
  constructor(private readonly databaseService: DatabaseService) {}
  async syncDeliveryQty(clientOrderId: string[]) {
    for (const id of clientOrderId) {
      const order =
        await this.databaseService.procurement.supplier_order_details.findMany({
          where: {
            order_id: id,
          },
        });

      if (order.length === 0) {
        throw new BaseError(404, 'Order not found');
      }

      for (const o of order) {
        const orderDetail =
          await this.databaseService.order.procurement_order_details.findFirst({
            where: {
              reference_id: o.supplier_reference_id,
              procurement_orders: {
                client_order_id: id,
              },
            },
          });

        if (!orderDetail) {
          throw new BaseError(404, 'Order detail not found');
        }

        const scmDetail =
          await this.databaseService.basic.scm_order_details.findFirst({
            where: {
              reference_id: orderDetail.reference_id,
              reference_order_id: id,
            },
          });

        if (!scmDetail) {
          throw new BaseError(404, 'SCM order detail not found');
        }

        await this.databaseService.order.procurement_order_details.update({
          where: { id: orderDetail.id },
          data: {
            deliver_qty: scmDetail.deliver_goods_qty,
          },
        });

        await this.databaseService.procurement.supplier_order_details.update({
          where: { id: o.id },
          data: {
            actual_delivery_qty: scmDetail.deliver_goods_qty,
          },
        });
      }
    }

    return {
      message: 'Delivery qty synced successfully',
    };
  }
}
