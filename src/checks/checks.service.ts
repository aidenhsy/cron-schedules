import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getCurrentChinaTime, getCurrentVersion } from '@saihu/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ChecksService {
  private readonly logger = new Logger(`${ChecksService.name}`);
  constructor(private readonly databaseService: DatabaseService) {}

  @Cron('45 12 * * *', {
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
      await this.databaseService.procurement.supplier_items.findMany({
        where: {
          status: 1,
        },
      });

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
                id: true,
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
          // get procurement detail
          const procurementDetail =
            procurementOrder.supplier_order_details.find(
              (d) => d.supplier_reference_id === orderDetail.reference_id,
            );
          if (!procurementDetail) {
            console.log(`${orderDetail.reference_id} not found`);
            continue;
          }

          // get scm order detail
          const basicDetail =
            await this.databaseService.basic.scm_order_details.findFirst({
              where: {
                reference_order_id: order.client_order_id,
                reference_id: orderDetail.reference_id,
              },
            });

          if (basicDetail) {
            if (
              Number(basicDetail.deliver_goods_qty) !==
              Number(orderDetail.deliver_qty)
            ) {
              await this.databaseService.order.procurement_order_details.update(
                {
                  where: {
                    id: orderDetail.id,
                  },
                  data: {
                    deliver_qty: basicDetail.deliver_goods_qty,
                  },
                },
              );
              console.log(
                `[delivery qty] ${orderDetail.reference_id} scm-order difference ${basicDetail.deliver_goods_qty} ${orderDetail.deliver_qty} \n id: ${order.client_order_id} \n `,
              );
              console.log('-----------');
            }
            if (
              Number(procurementDetail.actual_delivery_qty) !==
              Number(basicDetail.deliver_goods_qty)
            ) {
              await this.databaseService.procurement.supplier_order_details.update(
                {
                  where: {
                    id: procurementDetail.id,
                  },
                  data: {
                    actual_delivery_qty: basicDetail.deliver_goods_qty,
                  },
                },
              );
            }
          }

          // if basic detail not found, update procurement detail
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
              `[delivery qty] ${orderDetail.reference_id} procurement-order difference ${procurementDetail.actual_delivery_qty} ${orderDetail.deliver_qty} \n id: ${order.client_order_id} \n `,
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
  async checkReceiveQty() {
    this.logger.log('Checking receive qty');

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
              `[receive qty] ${orderDetail.reference_id} difference ${procurementDetail.confirm_delivery_qty} ${orderDetail.customer_receive_qty} \n id: ${order.client_order_id} \n `,
            );
            console.log('-----------');
          }
        }
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking receive qty done');
  }

  @Cron('10 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkFinalQty() {
    this.logger.log('Checking final qty');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const orders =
        await this.databaseService.order.procurement_orders.findMany({
          where: {
            status: {
              in: [4, 5],
            },
          },
          select: {
            client_order_id: true,
            procurement_order_details: {
              select: {
                reference_id: true,
                final_qty: true,
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
                final_qty: true,
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
            Number(procurementDetail.final_qty) !==
            Number(orderDetail.final_qty)
          ) {
            await this.databaseService.procurement.supplier_order_details.update(
              {
                where: {
                  id: procurementDetail.id,
                },
                data: {
                  final_qty: orderDetail.final_qty,
                },
              },
            );
            console.log(
              `[final qty] ${orderDetail.reference_id} difference ${procurementDetail.final_qty} ${orderDetail.final_qty} \n id: ${order.client_order_id} \n `,
            );
            console.log('-----------');
          }

          const basicDetail =
            await this.databaseService.basic.scm_order_details.findFirst({
              where: {
                reference_order_id: order.client_order_id,
                reference_id: orderDetail.reference_id,
              },
            });
          if (!basicDetail) {
            continue;
          }

          if (
            Number(basicDetail.delivery_qty) !== Number(orderDetail.final_qty)
          ) {
            await this.databaseService.basic.scm_order_details.update({
              where: {
                id: basicDetail.id,
              },
              data: {
                delivery_qty: orderDetail.final_qty,
              },
            });
            console.log(
              `[final qty] ${orderDetail.reference_id} scm-order difference ${basicDetail.delivery_qty} ${orderDetail.final_qty} \n id: ${order.client_order_id} \n `,
            );
            console.log('-----------');
          }
        }
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking final qty done');
  }

  @Cron('15 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkDeliveryTime() {
    this.logger.log('Checking final qty');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const orders =
        await this.databaseService.order.procurement_orders.findMany({
          select: {
            id: true,
            client_order_id: true,
            delivery_time: true,
            procurement_order_details: {
              select: {
                reference_id: true,
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
            delivery_time: true,
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

        let delivery_time: Date | undefined = undefined;
        for (const orderDetail of order.procurement_order_details) {
          const basicDetail =
            await this.databaseService.basic.scm_order_details.findFirst({
              where: {
                reference_order_id: order.client_order_id,
                reference_id: orderDetail.reference_id,
              },
              select: {
                scm_order: {
                  select: {
                    delivery_time: true,
                  },
                },
              },
            });
          if (!basicDetail) {
            console.log(
              `not found \n${orderDetail.reference_id} \n ${order.client_order_id} `,
            );
            console.log('-----------');
            continue;
          }
          delivery_time = basicDetail.scm_order?.delivery_time;
        }

        if (delivery_time) {
          // update scm order
          await this.databaseService.order.procurement_orders.update({
            where: {
              id: order.id,
            },
            data: {
              sent_time: delivery_time,
              delivery_time: delivery_time,
            },
          });
          // update procurement
          await this.databaseService.procurement.supplier_orders.update({
            where: {
              id: procurementOrder.id,
            },
            data: {
              sent_time: delivery_time,
              delivery_time: delivery_time,
            },
          });
        }
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking final qty done');
  }

  @Cron('25 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkReceiveTime() {
    this.logger.log('Checking receive time');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const orders =
        await this.databaseService.procurement.supplier_orders.findMany({
          where: {
            status: {
              in: [4, 5, 20],
            },
          },
          select: {
            id: true,
            receive_time: true,
            delivery_time: true,
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
        await this.databaseService.order.procurement_orders.findMany({
          where: {
            client_order_id: {
              in: orders.map((order) => order.id),
            },
          },
          select: {
            id: true,
            client_order_id: true,
          },
        });

      for (const order of orders) {
        const procurementOrder = procurementOrders.find(
          (o) => o.client_order_id === order.id,
        );

        if (!procurementOrder) {
          console.log(`${order.id} not found`);
          continue;
        }

        if (order.receive_time === null) {
          await this.databaseService.procurement.supplier_orders.update({
            where: {
              id: order.id,
            },
            data: {
              receive_time: order.delivery_time,
            },
          });
          await this.databaseService.order.procurement_orders.update({
            where: {
              id: procurementOrder.id,
            },
            data: {
              customer_receive_time: order.delivery_time,
            },
          });
          continue;
        }

        await this.databaseService.order.procurement_orders.update({
          where: {
            id: procurementOrder.id,
          },
          data: {
            customer_receive_time: order.receive_time,
          },
        });
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking receive time done');
  }

  @Cron('30 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkCalculatedAmount() {
    this.logger.log('Checking calculated amount');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const scmOorders =
        await this.databaseService.order.procurement_orders.findMany({
          include: {
            procurement_order_details: true,
          },
        });

      if (scmOorders.length < batchSize) {
        hasMoreOrders = false;
      }

      if (scmOorders.length === 0) {
        break;
      }

      const imOrders =
        await this.databaseService.procurement.supplier_orders.findMany({
          where: {
            id: {
              in: scmOorders.map((order) => order.client_order_id),
            },
          },
        });

      for (const scmOrder of scmOorders) {
        const imOrder = imOrders.find((o) => o.id === scmOrder.client_order_id);

        if (!imOrder) {
          console.log(`${scmOrder.client_order_id} not found`);
          continue;
        }

        const orderTotal = scmOrder.procurement_order_details.reduce(
          (acc, detail) =>
            acc + Number(detail.order_qty) * Number(detail.price),
          0,
        );
        const roundedOrderTotal = Math.round(orderTotal * 100) / 100;

        if (Number(roundedOrderTotal) !== Number(imOrder.order_amount)) {
          console.log(
            `[calculated amount] ${scmOrder.client_order_id} order amount difference ${roundedOrderTotal} ${imOrder.order_amount}`,
          );
          console.log('-----------');
          await this.databaseService.procurement.supplier_orders.update({
            where: {
              id: imOrder.id,
            },
            data: {
              order_amount: roundedOrderTotal,
            },
          });
          await this.databaseService.order.procurement_orders.update({
            where: {
              id: scmOrder.id,
            },
            data: {
              order_amount: roundedOrderTotal,
            },
          });
          continue;
        }

        if (Number(imOrder.order_amount) !== Number(scmOrder.order_amount)) {
          console.log(
            `[calculated amount] ${scmOrder.client_order_id} order amount for order and procurment difference ${imOrder.order_amount} ${scmOrder.order_amount}`,
          );
          console.log('-----------');
          await this.databaseService.order.procurement_orders.update({
            where: {
              id: scmOrder.id,
            },
            data: {
              order_amount: imOrder.order_amount,
            },
          });
        }
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking calculated amount done');
  }

  @Cron('35 * * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkFinalAmount() {
    this.logger.log('Checking final amount');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const scmOorders =
        await this.databaseService.order.procurement_orders.findMany({
          include: {
            procurement_order_details: true,
          },
          where: {
            status: {
              in: [4, 5],
            },
          },
        });

      if (scmOorders.length < batchSize) {
        hasMoreOrders = false;
      }

      if (scmOorders.length === 0) {
        break;
      }

      const imOrders =
        await this.databaseService.procurement.supplier_orders.findMany({
          where: {
            id: {
              in: scmOorders.map((order) => order.client_order_id),
            },
          },
        });

      for (const scmOrder of scmOorders) {
        const imOrder = imOrders.find((o) => o.id === scmOrder.client_order_id);

        if (!imOrder) {
          console.log(`${scmOrder.client_order_id} not found`);
          continue;
        }

        const finalTotal = scmOrder.procurement_order_details.reduce(
          (acc, detail) =>
            acc + Number(detail.final_qty) * Number(detail.price),
          0,
        );
        const roundedFinalTotal = Math.round(finalTotal * 100) / 100;

        if (Number(roundedFinalTotal) !== Number(imOrder.actual_amount)) {
          console.log(
            `[calculated final amount] ${scmOrder.client_order_id} final amount difference ${roundedFinalTotal} ${imOrder.order_amount}`,
          );
          console.log('-----------');
          await this.databaseService.procurement.supplier_orders.update({
            where: {
              id: imOrder.id,
            },
            data: {
              actual_amount: roundedFinalTotal,
            },
          });
          await this.databaseService.order.procurement_orders.update({
            where: {
              id: scmOrder.id,
            },
            data: {
              actual_amount: roundedFinalTotal,
            },
          });
          continue;
        }

        if (Number(imOrder.actual_amount) !== Number(scmOrder.actual_amount)) {
          console.log(
            `[calculated amount] ${scmOrder.client_order_id} order amount for order and procurment difference ${imOrder.order_amount} ${scmOrder.order_amount}`,
          );
          console.log('-----------');
          await this.databaseService.order.procurement_orders.update({
            where: {
              id: scmOrder.id,
            },
            data: {
              actual_amount: imOrder.actual_amount,
            },
          });
        }
      }

      // Move to the next batch
      skip += batchSize;
    }

    this.logger.log('Checking calculated actual amount done');
  }

  @Cron('38 11 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async checkUnreceivedOrders() {
    const today = getCurrentChinaTime();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0];
    const yesterdayDateWithTime = new Date(`${yesterdayDate}T12:00:00Z`);

    this.logger.log(
      `Checking unreceived orders before ${yesterdayDateWithTime.toISOString()}`,
    );

    const imOrders =
      await this.databaseService.procurement.supplier_orders.findMany({
        where: {
          status: 2,
          delivery_time: {
            lt: yesterdayDateWithTime,
          },
        },
        include: {
          supplier_order_details: true,
        },
      });

    const scmOrders =
      await this.databaseService.order.procurement_orders.findMany({
        where: {
          client_order_id: {
            in: imOrders.map((order) => order.id),
          },
        },
        include: {
          procurement_order_details: true,
        },
      });

    for (const imOrder of imOrders) {
      const scmOrder = scmOrders.find((o) => o.client_order_id === imOrder.id);

      if (!scmOrder) {
        console.log(`${imOrder.id} not found`);
        continue;
      }

      for (const imOrderDetail of imOrder.supplier_order_details) {
        const scmOrderDetail = scmOrder.procurement_order_details.find(
          (o) => o.reference_id === imOrderDetail.supplier_reference_id,
        );

        if (!scmOrderDetail) {
          console.log(
            `scm order detail ${imOrderDetail.supplier_reference_id} not found`,
          );
          continue;
        }

        const basicDetail =
          await this.databaseService.basic.scm_order_details.findFirst({
            where: {
              reference_order_id: imOrder.id,
              reference_id: imOrderDetail.supplier_reference_id,
            },
          });

        if (!basicDetail) {
          console.log(
            `basic order detail ${imOrderDetail.supplier_reference_id} not found`,
          );
          continue;
        }

        await this.databaseService.procurement.supplier_order_details.update({
          where: {
            id: imOrderDetail.id,
          },
          data: {
            actual_delivery_qty: basicDetail.deliver_goods_qty,
            confirm_delivery_qty: basicDetail.deliver_goods_qty,
            final_qty: basicDetail.deliver_goods_qty,
          },
        });

        await this.databaseService.order.procurement_order_details.update({
          where: {
            id: scmOrderDetail.id,
          },
          data: {
            deliver_qty: basicDetail.deliver_goods_qty,
            customer_receive_qty: basicDetail.deliver_goods_qty,
            final_qty: basicDetail.deliver_goods_qty,
          },
        });
      }

      const updatedScmOrder =
        await this.databaseService.order.procurement_orders.findFirst({
          where: {
            id: scmOrder.id,
          },
          include: {
            procurement_order_details: true,
          },
        });

      const updatedImOrder =
        await this.databaseService.procurement.supplier_orders.findFirst({
          where: {
            id: imOrder.id,
          },
          include: {
            supplier_order_details: true,
          },
        });

      const totalAmount = updatedScmOrder!.procurement_order_details.reduce(
        (acc, detail) => acc + Number(detail.final_qty) * Number(detail.price),
        0,
      );

      const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

      await this.databaseService.order.procurement_orders.update({
        where: {
          id: scmOrder.id,
        },
        data: {
          actual_amount: roundedTotalAmount,
          status: 4,
        },
      });

      await this.databaseService.procurement.supplier_orders.update({
        where: {
          id: imOrder.id,
        },
        data: {
          actual_amount: roundedTotalAmount,
          status: 4,
        },
      });
    }

    this.logger.log('Checking unreceived orders done');
  }
}
