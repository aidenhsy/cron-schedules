import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { getCurrentChinaTime } from '@saihu/common';
import { DatabaseService } from 'src/database/database.service';
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  @RabbitSubscribe({
    exchange: 'order',
    routingKey: 'order.delivered',
    queue: 'q.order.delivered.scheduler',
    queueOptions: { durable: true },
  })
  async finishOrder(msg: { id: string; aggregateId: string; payload: any }) {
    const { id, aggregateId, payload } = msg;

    const procurementDetailsCount =
      await this.databaseService.procurement.supplier_order_details.count({
        where: {
          order_id: aggregateId,
        },
      });

    const basicDetailsCount =
      await this.databaseService.basic.scm_order_details.count({
        where: {
          reference_order_id: aggregateId,
        },
      });

    if (
      Number(payload.procurement_order_details.length) ===
        Number(basicDetailsCount) &&
      Number(payload.procurement_order_details.length) ===
        Number(procurementDetailsCount)
    ) {
      for (const detail of payload.procurement_order_details) {
        const basicDetail =
          await this.databaseService.basic.scm_order_details.findFirst({
            where: {
              reference_id: detail.reference_id,
              reference_order_id: aggregateId,
            },
          });
        if (!basicDetail) {
          this.logger.error('Basic detail not found', {
            detail,
          });
          return;
        }
        const imSupplierOrderDetail =
          await this.databaseService.procurement.supplier_order_details.findFirst(
            {
              where: {
                order_id: aggregateId,
                supplier_reference_id: detail.supplier_reference_id,
              },
            },
          );
        if (!imSupplierOrderDetail) {
          this.logger.error('im procurement order detail not found', {
            detail,
          });
          return;
        }
        await this.databaseService.procurement.supplier_order_details.update({
          where: {
            id: imSupplierOrderDetail.id,
          },
          data: {
            actual_delivery_qty: basicDetail.delivery_qty,
            confirm_delivery_qty: basicDetail.delivery_qty,
            final_qty: basicDetail.delivery_qty,
            is_locked: true,
          },
        });
        await this.databaseService.order.procurement_order_details.update({
          where: {
            id: detail.id,
          },
          data: {
            deliver_qty: basicDetail.delivery_qty,
            customer_receive_qty: basicDetail.delivery_qty,
            final_qty: basicDetail.delivery_qty,
            is_locked: true,
          },
        });
      }
    } else {
      this.logger.error('Order details count mismatch', {
        aggregateId,
      });
    }

    await this.rabbitmqService.emitProcessed('order.delivered', {
      id,
      aggregateId,
    });
  }
}
