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
              this.logger.warn(
                `[basic vs order] order_id=${order.client_order_id}, ref=${refKey}, basic=${basicQty}, order=${orderQty}`,
              );
            }

            if (!eq(procQty, basicQty)) {
              procurementVsBasic++;
              this.logger.warn(
                `[proc vs basic] order_id=${order.client_order_id}, ref=${refKey}, proc=${procQty}, basic=${basicQty}`,
              );
            }

            // 👇 optional consolidated log showing all three values for this reference
            if (!eq(orderQty, basicQty) || !eq(procQty, basicQty)) {
              console.log(
                `Delivery difference: order_id=${order.client_order_id}, ref=${refKey}, order=${orderQty}, basic=${basicQty}, procurement=${procQty}`,
              );
            }
          } else {
            // no basic → compare procurement vs order only
            if (!eq(procQty, orderQty)) {
              procurementVsOrder++;
              this.logger.warn(
                `[proc vs order] order_id=${order.client_order_id}, ref=${refKey}, proc=${procQty}, order=${orderQty}`,
              );

              console.log(
                `Delivery difference (no basic): order_id=${order.client_order_id}, ref=${refKey}, order=${orderQty}, procurement=${procQty}`,
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

  // async dailyReport() {
  //   const { missingScmOrders, missingProcurementOrders } =
  //     await this.checkDifferentOrders();

  //   const { summary, orders } = await this.checkDeliveryQty();

  //   // summary section
  //   const summarySection = `
  // 📊 Daily Report

  // Missing Orders:
  //   • SCM orders: ${missingScmOrders.length}
  //   • Procurement orders: ${missingProcurementOrders.length}

  // Delivery Qty Mismatch:
  //   • Orders with mismatches: ${summary.total_orders_with_diffs}
  //   • basic-vs-order: ${summary.total_basic_vs_order}
  //   • procurement-vs-basic: ${summary.total_procurement_vs_basic}
  //   • procurement-vs-order: ${summary.total_procurement_vs_order}
  // `.trim();

  //   // per-order section (only client_order_id and counts)
  //   const ordersSection =
  //     orders.length > 0
  //       ? `\n\nOrders with mismatches:\n` +
  //         orders
  //           .map(
  //             (o) =>
  //               `- ${o.client_order_id}\n` +
  //               `    basic-vs-order: ${o.basic_vs_order}, procurement-vs-basic: ${o.procurement_vs_basic}, procurement-vs-order: ${o.procurement_vs_order}`,
  //           )
  //           .join('\n\n')
  //       : `\n\nNo mismatches found 🎉`;

  //   const body = summarySection + ordersSection;

  //   await this.mailService.sendMail({
  //     to: 'aiden@shaihukeji.com',
  //     subject: 'Daily Report',
  //     text: body,
  //     attachments: [],
  //   });

  //   return {
  //     message: `Daily report sent to aiden@shaihukeji.com`,
  //   };
  // }

  async orderSync() {
    this.logger.log('Order sync');

    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    const mismatchedDeliveryOrderIds = new Set<string>();
    const mismatchedFinalOrderIds = new Set<string>();

    const num = (v: any) => (v == null ? null : Number(v));
    const allEqual3 = (a: number | null, b: number | null, c: number | null) =>
      a === b && b === c;

    while (hasMoreOrders) {
      const orders =
        await this.databaseService.order.procurement_orders.findMany({
          select: {
            client_order_id: true,
            status: true,
            procurement_order_details: {
              select: {
                reference_id: true,
                deliver_qty: true,
                final_qty: true,
              },
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
            status: true,
            supplier_order_details: {
              select: {
                supplier_reference_id: true,
                actual_delivery_qty: true,
                final_qty: true,
              },
            },
          },
        });

      type Detail = {
        status: number;
        actual_delivery_qty: number | null;
        final_qty: number | null;
      };

      const procurementDetailsByOrder = new Map<string, Detail>(
        procurementOrders.flatMap((po) =>
          po.supplier_order_details.map((d): [string, Detail] => [
            `${po.id}::${d.supplier_reference_id}`,
            {
              status: po.status,
              actual_delivery_qty:
                d.actual_delivery_qty == null
                  ? null
                  : Number(d.actual_delivery_qty),
              final_qty: d.final_qty == null ? null : Number(d.final_qty),
            },
          ]),
        ),
      );

      const basicRows =
        await this.databaseService.basic.scm_order_details.findMany({
          where: { reference_order_id: { in: clientOrderIds } },
          select: {
            reference_order_id: true,
            reference_id: true,
            deliver_goods_qty: true, // for delivery comparison
            delivery_qty: true, // used alongside finals
          },
        });

      const basicDetailsByOrder = new Map<string, any>(
        basicRows.map((b) => [`${b.reference_order_id}::${b.reference_id}`, b]),
      );

      for (const order of orders) {
        for (const oDetail of order.procurement_order_details) {
          const key = `${order.client_order_id}::${oDetail.reference_id}`;
          const pDetail = procurementDetailsByOrder.get(key);
          const bDetail = basicDetailsByOrder.get(key);

          // Delivery qty triple: basic.deliver_goods_qty vs procurement.actual_delivery_qty vs order.deliver_qty
          const bdg = num(bDetail?.deliver_goods_qty);
          const pad = num(pDetail?.actual_delivery_qty);
          const od = num(oDetail.deliver_qty);

          if (!allEqual3(bdg, pad, od)) {
            mismatchedDeliveryOrderIds.add(order.client_order_id);
            console.log(`🔍 DELIVERY MISMATCH:`, {
              order_id: order.client_order_id,
              order_status: order.status,
              reference_id: oDetail.reference_id,
              basic_deliver_goods_qty: bdg,
              procurement_actual_delivery_qty: pad,
              order_deliver_qty: od,
              key: key,
            });
          }

          // Final qty triple (only if order.status in {4,5}):
          if (order.status === 4 || order.status === 5) {
            const pf = num(pDetail?.final_qty);
            const of = num(oDetail.final_qty);
            const bf = num(bDetail?.delivery_qty);
            if (!allEqual3(pf, of, bf)) {
              mismatchedFinalOrderIds.add(order.client_order_id);
              console.log(`🔍 FINAL QTY MISMATCH:`, {
                order_id: order.client_order_id,
                order_status: order.status,
                reference_id: oDetail.reference_id,
                procurement_final_qty: pf,
                order_final_qty: of,
                basic_delivery_qty: bf,
                key: key,
              });
            }
          }
        }
      }

      skip += batchSize;
    }

    return {
      deliveryMismatches: [...mismatchedDeliveryOrderIds],
      finalMismatches: [...mismatchedFinalOrderIds],
    };
  }

  async dailyReport() {
    const { missingScmOrders, missingProcurementOrders } =
      await this.checkDifferentOrders();

    // Pull mismatch IDs from orderSync
    const { deliveryMismatches, finalMismatches } = await this.orderSync();

    const summarySection = `
  Daily Report
  
  Missing Orders:
    • SCM orders: ${missingScmOrders.length}
    • Procurement orders: ${missingProcurementOrders.length}
  
  Cross-System Sync:
    • Delivery qty mismatches: ${deliveryMismatches.length}
    • Final qty mismatches (status 4/5): ${finalMismatches.length}
  `.trim();

    const detailsSection =
      deliveryMismatches.length || finalMismatches.length
        ? `
  
  Details:
  ${deliveryMismatches.length ? `• Delivery mismatches:\n  ${deliveryMismatches.join('\n  ')}` : ''}
  ${finalMismatches.length ? `• Final mismatches (4/5):\n  ${finalMismatches.join('\n  ')}` : ''}`
        : `
  
  All orders matched across systems ✅`;

    const body = summarySection + detailsSection;

    console.log(summarySection, '\n', body);

    await this.mailService.sendMail({
      to: 'aiden@shaihukeji.com',
      subject: 'Daily Report',
      text: body,
      attachments: [],
    });

    return { message: `Daily report sent to aiden@shaihukeji.com` };
  }
}
