import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getCurrentVersion } from '@saihu/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ChecksService {
  private readonly logger = new Logger(`${ChecksService.name}`);
  constructor(private readonly databaseService: DatabaseService) {}

  @Cron('00 22 * * *', {
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
        missingScmOrders.map((order) => order.id),
      );
    }

    if (missingProcurementOrders.length > 0) {
      this.logger.warn(
        `Missing procurement orders: ${missingProcurementOrders.length}`,
        missingProcurementOrders.map((order) => order.client_order_id),
      );
    }

    this.logger.log('Checking different orders done');
  }

  @Cron('42 11 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkPricings() {
    this.logger.log(`Checking pricings for version ${getCurrentVersion()}`);
    const currentVersion = getCurrentVersion();
    const goods = await this.databaseService.basic.scm_goods.findMany();

    for (const good of goods) {
      const pricing = await this.databaseService.pricing.scm_goods.findFirst({
        where: {
          id: good.id,
        },
      });
      if (!pricing) {
        console.log(`${good.id} ${good.name} not found`);
      }

      if (Number(good.price) !== Number(pricing?.price)) {
        console.log(
          `${good.id} ${good.name} ${good.price} ${pricing?.price} not good price `,
        );
      }

      const pricings =
        await this.databaseService.pricing.scm_good_pricing.findMany({
          where: {
            goods_id: good.id,
            version: currentVersion,
          },
        });

      for (const item of pricings) {
        if (item.pricing_strategy === 'margin') {
          const correctPrice =
            Math.round(
              Number(good.price) * (1 + Number(item.profit_margin) / 100) * 100,
            ) / 100;

          if (Number(correctPrice) !== Number(item.sale_price)) {
            console.log(
              `${good.id} ${good.name} ${correctPrice} ${item.sale_price} not margin price equal`,
            );
          }
        }
      }
    }

    this.logger.log('Checking pricings done');
  }

  @Cron('50 11 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkImScmSyncPricings() {
    this.logger.log(
      `Checking im scm sync pricings for version ${getCurrentVersion()}`,
    );
    const supplierGoods =
      await this.databaseService.procurement.supplier_items.findMany();

    for (const good of supplierGoods) {
      const goodPrice =
        await this.databaseService.pricing.scm_good_pricing.findFirst({
          where: {
            external_reference_id: good.supplier_reference_id,
          },
        });

      if (!goodPrice) {
        console.log(`${good.supplier_reference_id} not found`);
      }

      if (Number(good.price) !== Number(goodPrice?.sale_price)) {
        console.log(
          `${good.supplier_reference_id} ${good.price} ${goodPrice?.sale_price} not equal`,
        );
      }
    }

    this.logger.log('Checking im scm sync pricings done');
  }

  @Cron('0 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkDeliveryQty() {
    this.logger.log('Checking delivery qty');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const orders =
        await this.databaseService.order.procurement_orders.findMany({
          select: {
            client_order_id: true,
            procurement_order_details: {
              select: {
                reference_id: true,
                deliver_qty: true,
              },
            },
          },
          take: batchSize,
          skip: skip,
        });

      if (orders.length < batchSize) {
        hasMoreOrders = false;
      }

      if (orders.length === 0) {
        break;
      }

      const procurementOrders =
        await this.databaseService.procurement.supplier_orders.findMany({
          where: {
            id: {
              in: orders.map((order) => order.client_order_id),
            },
          },
          select: {
            id: true,
            supplier_order_details: {
              select: {
                id: true,
                supplier_reference_id: true,
                actual_delivery_qty: true,
              },
            },
          },
        });

      for (const order of orders) {
        const procurementOrder = procurementOrders.find(
          (o) => o.id === order.client_order_id,
        );

        if (!procurementOrder) {
          console.log(`${order.client_order_id} not found`);
          continue;
        }

        for (const orderDetail of order.procurement_order_details) {
          const procurementDetail =
            procurementOrder.supplier_order_details.find(
              (d) => d.supplier_reference_id === orderDetail.reference_id,
            );
          if (!procurementDetail) {
            console.log(`${orderDetail.reference_id} not found`);
            continue;
          }
          if (
            Number(procurementDetail.actual_delivery_qty) !==
            Number(orderDetail.deliver_qty)
          ) {
            await this.databaseService.procurement.supplier_order_details.update(
              {
                where: {
                  id: procurementDetail.id,
                },
                data: {
                  actual_delivery_qty: orderDetail.deliver_qty,
                },
              },
            );
            console.log(
              `${orderDetail.reference_id} difference ${procurementDetail.actual_delivery_qty} ${orderDetail.deliver_qty} \n id: ${order.client_order_id} \n `,
            );
            console.log('-----------');
          }
        }
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking delivery qty done');
  }

  @Cron('5 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkReceiptQty() {
    this.logger.log('Checking delivery qty');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const orders =
        await this.databaseService.order.procurement_orders.findMany({
          select: {
            client_order_id: true,
            procurement_order_details: {
              select: {
                reference_id: true,
                customer_receive_qty: true,
                id: true,
              },
            },
          },
          take: batchSize,
          skip: skip,
        });

      if (orders.length < batchSize) {
        hasMoreOrders = false;
      }

      if (orders.length === 0) {
        break;
      }

      const procurementOrders =
        await this.databaseService.procurement.supplier_orders.findMany({
          where: {
            id: {
              in: orders.map((order) => order.client_order_id),
            },
          },
          select: {
            id: true,
            supplier_order_details: {
              select: {
                id: true,
                supplier_reference_id: true,
                confirm_delivery_qty: true,
              },
            },
          },
        });

      for (const order of orders) {
        const procurementOrder = procurementOrders.find(
          (o) => o.id === order.client_order_id,
        );

        if (!procurementOrder) {
          console.log(`${order.client_order_id} not found`);
          continue;
        }

        for (const orderDetail of order.procurement_order_details) {
          const procurementDetail =
            procurementOrder.supplier_order_details.find(
              (d) => d.supplier_reference_id === orderDetail.reference_id,
            );
          if (!procurementDetail) {
            console.log(`${orderDetail.reference_id} not found`);
            continue;
          }
          if (
            Number(procurementDetail.confirm_delivery_qty) !==
            Number(orderDetail.customer_receive_qty)
          ) {
            await this.databaseService.order.procurement_order_details.update({
              where: {
                id: orderDetail.id,
              },
              data: {
                customer_receive_qty: procurementDetail.confirm_delivery_qty,
              },
            });
            console.log(
              `${orderDetail.reference_id} difference ${procurementDetail.confirm_delivery_qty} ${orderDetail.customer_receive_qty} \n id: ${order.client_order_id} \n `,
            );
            console.log('-----------');
          }
        }
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking delivery qty done');
  }
}
