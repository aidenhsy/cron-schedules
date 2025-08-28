import { MailService } from './../mail/mail.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getCurrentChinaTime, getCurrentVersion } from '@saihu/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ChecksService {
  private readonly logger = new Logger(`${ChecksService.name}`);
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly mailService: MailService,
  ) {}

  // @Cron('45 12 * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

    return {
      missingScmOrders: missingScmOrders.map((order) => order.id),
      missingProcurementOrders: missingProcurementOrders.map(
        (order) => order.id,
      ),
    };
  }

  // @Cron('42 11 * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

  // @Cron('50 11 * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

  // @Cron('0 * * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
  async checkDeliveryQty() {
    this.logger.log('Checking delivery qty (read-only)');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    type OrderSummary = {
      client_order_id: string;
      type: string | null;
      sent_time: Date | null;
      basic_vs_order: number;
      procurement_vs_basic: number;
      procurement_vs_order: number;
    };

    const orderSummaries: OrderSummary[] = [];

    // choose which basic column is canonical for this check
    const useBasicDeliveryQty = false; // false => use deliver_goods_qty; true => delivery_qty

    const toNum = (x: any) =>
      x == null || x === '' ? 0 : typeof x === 'number' ? x : Number(x);

    const eq = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

    const normKey = (s: string) => (s ?? '').trim();

    const debug = false; // set true to see triplets that mismatch

    while (hasMoreOrders) {
      const orders =
        await this.databaseService.order.procurement_orders.findMany({
          select: {
            client_order_id: true,
            type: true,
            sent_time: true,
            procurement_order_details: {
              select: { reference_id: true, deliver_qty: true },
            },
          },
          where: { status: { in: [3, 4, 5, 20] } },
          take: batchSize,
          skip,
          orderBy: { id: 'asc' },
        });

      if (orders.length === 0) break;
      if (orders.length < batchSize) hasMoreOrders = false;

      const clientOrderIds = orders.map((o) => o.client_order_id);

      const procurementOrders =
        await this.databaseService.procurement.supplier_orders.findMany({
          where: { id: { in: clientOrderIds } },
          select: {
            id: true,
            supplier_order_details: {
              select: {
                supplier_reference_id: true,
                actual_delivery_qty: true,
              },
            },
          },
        });

      const procurementDetailsByOrder = new Map<
        string,
        Map<string, { actual_delivery_qty: any }>
      >();
      for (const po of procurementOrders) {
        const byRef = new Map<string, { actual_delivery_qty: any }>();
        for (const det of po.supplier_order_details) {
          byRef.set(normKey(det.supplier_reference_id), {
            actual_delivery_qty: det.actual_delivery_qty,
          });
        }
        procurementDetailsByOrder.set(po.id, byRef);
      }

      // fetch both columns; pick one centrally below
      const basicRows =
        await this.databaseService.basic.scm_order_details.findMany({
          where: { reference_order_id: { in: clientOrderIds } },
          select: {
            reference_order_id: true,
            reference_id: true,
            deliver_goods_qty: true,
            delivery_qty: true,
          },
        });

      const basicByPair = new Map<
        string,
        { deliver_goods_qty: any; delivery_qty: any }
      >();
      for (const b of basicRows) {
        const key = `${normKey(b.reference_order_id ?? '')}|${normKey(
          b.reference_id ?? '',
        )}`;
        // optional: detect duplicates and log
        if (basicByPair.has(key) && debug) {
          this.logger.warn(`Duplicate basic row for ${key}`);
        }
        basicByPair.set(key, {
          deliver_goods_qty: b.deliver_goods_qty,
          delivery_qty: b.delivery_qty,
        });
      }

      for (const order of orders) {
        let basicVsOrder = 0;
        let procurementVsBasic = 0;
        let procurementVsOrder = 0;

        const pDetails =
          procurementDetailsByOrder.get(order.client_order_id) ?? new Map();

        for (const od of order.procurement_order_details) {
          const refKey = normKey(od.reference_id ?? '');
          const pDetail = pDetails.get(refKey);
          if (!pDetail) continue;

          const basic = basicByPair.get(
            `${normKey(order.client_order_id)}|${refKey}`,
          );

          const orderQty = toNum(od.deliver_qty);
          const procQty = toNum(pDetail.actual_delivery_qty);

          if (basic) {
            const basicQty = useBasicDeliveryQty
              ? toNum((basic as any).delivery_qty)
              : toNum((basic as any).deliver_goods_qty);

            if (!eq(basicQty, orderQty)) {
              basicVsOrder++;
              if (debug)
                this.logger.warn(
                  `[basic vs order] ${order.client_order_id}|${refKey} basic=${basicQty} order=${orderQty}`,
                );
            }
            if (!eq(procQty, basicQty)) {
              procurementVsBasic++;
              if (debug)
                this.logger.warn(
                  `[proc vs basic] ${order.client_order_id}|${refKey} proc=${procQty} basic=${basicQty}`,
                );
            }
          } else {
            // no basic → compare procurement vs order only
            if (!eq(procQty, orderQty)) {
              procurementVsOrder++;
              if (debug)
                this.logger.warn(
                  `[proc vs order] ${order.client_order_id}|${refKey} proc=${procQty} order=${orderQty}`,
                );
            }
          }
        }

        if (basicVsOrder || procurementVsBasic || procurementVsOrder) {
          orderSummaries.push({
            client_order_id: order.client_order_id,
            type: order.type?.toString() ?? null,
            sent_time: order.sent_time ?? null,
            basic_vs_order: basicVsOrder,
            procurement_vs_basic: procurementVsBasic,
            procurement_vs_order: procurementVsOrder,
          });
        }
      }

      skip += batchSize;
    }

    this.logger.log('Checking delivery qty done');

    const reportLines = orderSummaries.map((o) => {
      const sent = o.sent_time
        ? o.sent_time.toISOString().split('T')[0]
        : 'n/a';
      return `- ${o.client_order_id} (sent: ${sent}) → basic-vs-order:${o.basic_vs_order}, procurement-vs-basic:${o.procurement_vs_basic}, procurement-vs-order:${o.procurement_vs_order}`;
    });

    return {
      report: reportLines.join('\n'),
      summary: {
        total_orders_with_diffs: orderSummaries.length,
        total_basic_vs_order: orderSummaries.reduce(
          (s, o) => s + o.basic_vs_order,
          0,
        ),
        total_procurement_vs_basic: orderSummaries.reduce(
          (s, o) => s + o.procurement_vs_basic,
          0,
        ),
        total_procurement_vs_order: orderSummaries.reduce(
          (s, o) => s + o.procurement_vs_order,
          0,
        ),
      },
      orders: orderSummaries,
    };
  }

  async dailyReport() {
    const { missingScmOrders, missingProcurementOrders } =
      await this.checkDifferentOrders();

    const { summary, orders } = await this.checkDeliveryQty();

    // summary section
    const summarySection = `
  📊 Daily Report
  
  Missing Orders:
    • SCM orders: ${missingScmOrders.length}
    • Procurement orders: ${missingProcurementOrders.length}
  
  Delivery Qty Mismatch:
    • Orders with mismatches: ${summary.total_orders_with_diffs}
    • basic-vs-order: ${summary.total_basic_vs_order}
    • procurement-vs-basic: ${summary.total_procurement_vs_basic}
    • procurement-vs-order: ${summary.total_procurement_vs_order}
  `.trim();

    // per-order section (only client_order_id and counts)
    const ordersSection =
      orders.length > 0
        ? `\n\nOrders with mismatches:\n` +
          orders
            .map(
              (o) =>
                `- ${o.client_order_id}\n` +
                `    basic-vs-order: ${o.basic_vs_order}, procurement-vs-basic: ${o.procurement_vs_basic}, procurement-vs-order: ${o.procurement_vs_order}`,
            )
            .join('\n\n')
        : `\n\nNo mismatches found 🎉`;

    const missingMatchIds = orders
      .filter(
        (o) =>
          o.basic_vs_order > 0 ||
          o.procurement_vs_basic > 0 ||
          o.procurement_vs_order > 0,
      )
      .map((o) => o.client_order_id);

    const idSection =
      orders.length > 0
        ? `\n\nMissing match ids:\n` + missingMatchIds.join('\n')
        : `\n\nNo missing match ids found 🎉`;

    const body = summarySection + ordersSection + idSection;

    await this.mailService.sendMail({
      to: 'aiden@shaihukeji.com',
      subject: 'Daily Report',
      text: body,
      attachments: [],
    });

    return {
      message: `Daily report sent to aiden@shaihukeji.com`,
    };
  }
  // @Cron('5 * * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

  // @Cron('10 * * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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
                delivery_qty: Number(orderDetail.final_qty),
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

  // @Cron('15 * * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

  // @Cron('25 * * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

  // @Cron('30 * * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

  // @Cron('35 * * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
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

  // @Cron('07 16 * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
  async checkUnreceivedOrders() {
    this.logger.log('Checking unreceived orders');
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
