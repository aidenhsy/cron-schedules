import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
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

    const order =
      await this.databaseService.procurement.supplier_orders.findUnique({
        where: {
          id: aggregateId,
        },
        include: {
          supplier_order_details: true,
        },
      });

    if (!order) {
      this.logger.error(`Order ${aggregateId} not found`);
      return;
    }
    const orderDetails =
      await this.databaseService.order.procurement_order_details.findMany({
        where: {
          procurement_orders: {
            client_order_id: order.id,
          },
        },
        select: {
          id: true,
          deliver_qty: true,
          reference_id: true,
        },
      });
    const scmDetails =
      await this.databaseService.basic.scm_order_details.findMany({
        where: {
          reference_order_id: order.id,
        },
        select: {
          reference_id: true,
          delivery_qty: true,
        },
      });
    if (
      orderDetails.length !== order.supplier_order_details.length ||
      scmDetails.length !== order.supplier_order_details.length
    ) {
      this.logger.error(`Order ${aggregateId} has mismatched details`, {
        orderDetails: orderDetails.length,
        scmDetails: scmDetails.length,
        supplierDetails: order.supplier_order_details.length,
      });
      return;
    }
    const orderMap = new Map<string, any>(
      orderDetails.map((o) => [o.reference_id, o]) as [string, any][],
    );
    const scmMap = new Map<string, any>(
      scmDetails.map((o) => [o.reference_id, o]) as [string, any][],
    );

    for (const detail of order.supplier_order_details) {
      const orderDetail = orderMap.get(detail.supplier_reference_id);
      const scmDetail = scmMap.get(detail.supplier_reference_id);

      if (
        Number(detail.confirm_delivery_qty) ===
          Number(orderDetail.deliver_qty) &&
        Number(detail.confirm_delivery_qty) ===
          Number(scmDetail.delivery_qty) &&
        Number(detail.actual_delivery_qty) === Number(scmDetail.delivery_qty)
      ) {
        await this.databaseService.order.procurement_order_details.update({
          where: {
            id: orderDetail.id,
          },
          data: {
            final_qty: detail.confirm_delivery_qty,
          },
        });
        await this.databaseService.procurement.supplier_order_details.update({
          where: {
            id: detail.id,
          },
          data: {
            final_qty: detail.confirm_delivery_qty,
          },
        });
      }
    }

    await this.databaseService.order.procurement_orders.update({
      where: {
        client_order_id: order.id,
      },
      data: {
        status: 4,
      },
    });
    await this.databaseService.procurement.supplier_orders.update({
      where: {
        id: order.id,
      },
      data: {
        status: 4,
      },
    });

    await this.rabbitmqService.emitProcessed('order.delivered', {
      id,
      aggregateId,
    });
  }
}
