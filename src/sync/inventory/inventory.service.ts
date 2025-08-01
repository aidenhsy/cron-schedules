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

  @Cron('50 16 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async syncSupplierItems() {
    this.logger.log('starting syncing supplierItems');
    const batchSize = 500;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const supplierItems =
        await this.databaseService.procurement.supplier_items.findMany({
          skip,
          take: batchSize,
        });

      if (supplierItems.length < batchSize) {
        hasMoreOrders = false;
      }

      if (supplierItems.length === 0) {
        break;
      }

      skip += batchSize;
      for (const supplierItem of supplierItems) {
        await this.databaseService.inventory.supplier_items.upsert({
          where: {
            id: supplierItem.id,
          },
          update: {
            ...supplierItem,
          },
          create: {
            ...supplierItem,
          },
        });
      }
    }
    this.logger.log('syncing supplierItems completed');
  }

  @Cron('0 18 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async syncSupplierOrders() {
    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const finishedOrders =
        await this.databaseService.procurement.supplier_orders.findMany({
          where: {
            status: {
              in: [4, 5],
            },
          },
          include: {
            supplier_order_details: true,
          },
          skip,
          take: batchSize,
        });

      if (finishedOrders.length < batchSize) {
        hasMoreOrders = false;
      }

      if (finishedOrders.length === 0) {
        break;
      }

      skip += batchSize;

      const inventoryOrders =
        await this.databaseService.inventory.supplier_orders.findMany({
          where: {
            id: {
              in: finishedOrders.map((order) => order.id),
            },
          },
          include: {
            supplier_order_details: true,
          },
        });

      const missingInventoryOrders = finishedOrders.filter(
        (order) => !inventoryOrders.some((i) => i.id === order.id),
      );

      if (missingInventoryOrders.length > 0) {
        this.logger.warn(
          `Missing inventory orders: ${missingInventoryOrders.map((o) => o.id).join(', ')}`,
        );

        for (const order of missingInventoryOrders) {
          const { supplier_order_details, ...rest } = order;
          await this.databaseService.inventory.supplier_orders.create({
            data: {
              ...rest,
            },
          });
          await this.databaseService.inventory.supplier_order_details.createMany(
            {
              data: order.supplier_order_details,
            },
          );
        }
      }

      for (const finishedOrder of finishedOrders) {
        for (const finishedOrderDetail of finishedOrder.supplier_order_details) {
          const inventoryOrderDetail = inventoryOrders
            .find((i) => i.id === finishedOrder.id)
            ?.supplier_order_details.find(
              (i) => i.id === finishedOrderDetail.id,
            );

          if (!inventoryOrderDetail) {
            this.logger.warn(
              `Missing inventory order detail: ${finishedOrderDetail.id}`,
            );
            continue;
          }

          if (
            Number(finishedOrderDetail.final_qty) !==
            Number(inventoryOrderDetail.final_qty)
          ) {
            await this.databaseService.inventory.supplier_order_details.update({
              where: {
                id: inventoryOrderDetail.id,
              },
              data: {
                final_qty: finishedOrderDetail.final_qty,
              },
            });
          }
        }
      }
    }
  }

  @Cron('5 18 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async missingWac() {
    const batchSize = 100;
    let skip = 0;
    let hasMoreOrders = true;

    while (hasMoreOrders) {
      const supplierOrders =
        await this.databaseService.inventory.supplier_orders.findMany({
          where: {
            status: {
              in: [4, 5],
            },
          },
          include: {
            supplier_order_details: true,
          },
          skip,
          take: batchSize,
        });

      if (supplierOrders.length < batchSize) {
        hasMoreOrders = false;
      }

      if (supplierOrders.length === 0) {
        break;
      }

      skip += batchSize;

      for (const supplierOrder of supplierOrders) {
        if (!supplierOrder.receive_time) {
          this.logger.warn(
            `Supplier order ${supplierOrder.id} has no receive time`,
          );
          continue;
        }

        for (const supplierOrderDetail of supplierOrder.supplier_order_details) {
          const existingWac =
            await this.databaseService.inventory.shop_item_weighted_price.findFirst(
              {
                where: {
                  source_detail_id: supplierOrderDetail.id,
                },
              },
            );

          if (!existingWac) {
            const lastWac =
              await this.databaseService.inventory.shop_item_weighted_price.findFirst(
                {
                  where: {
                    shop_id: supplierOrder.shop_id,
                    supplier_item_id: supplierOrderDetail.supplier_item_id!,
                    created_at: {
                      lt: supplierOrder.receive_time,
                    },
                  },
                  orderBy: {
                    created_at: 'desc',
                  },
                },
              );
            if (lastWac) {
              const oldTotalQty = Number(lastWac.total_qty);
              const oldTotalValue = Number(lastWac.total_value);
              const newTotalQty =
                oldTotalQty + Number(supplierOrderDetail.final_qty);
              const newTotalValue =
                oldTotalValue +
                Number(supplierOrderDetail.price) *
                  Number(supplierOrderDetail.final_qty);
              const newWeightedPrice = newTotalValue / newTotalQty;
              await this.databaseService.inventory.shop_item_weighted_price.create(
                {
                  data: {
                    source_order_id: supplierOrder.id,
                    source_detail_id: supplierOrderDetail.id,
                    supplier_item_id: supplierOrderDetail.supplier_item_id!,
                    created_at: supplierOrder.receive_time,
                    updated_at: supplierOrder.receive_time,
                    shop_id: supplierOrder.shop_id,
                    type: 'order_in',
                    weighted_price: newWeightedPrice,
                    total_qty: newTotalQty,
                    total_value: newTotalValue,
                  },
                },
              );
            } else {
              await this.databaseService.inventory.shop_item_weighted_price.create(
                {
                  data: {
                    source_order_id: supplierOrder.id,
                    source_detail_id: supplierOrderDetail.id,
                    supplier_item_id: supplierOrderDetail.supplier_item_id!,
                    created_at: supplierOrder.receive_time,
                    updated_at: supplierOrder.receive_time,
                    shop_id: supplierOrder.shop_id,
                    type: 'order_in',
                    weighted_price: supplierOrderDetail.price,
                    total_qty: supplierOrderDetail.final_qty,
                    total_value:
                      Number(supplierOrderDetail.price) *
                      Number(supplierOrderDetail.final_qty),
                  },
                },
              );
            }
          }
        }
      }
    }
  }

  @Cron('15 18 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async recalculateWac() {
    const batchSize = 100;

    const distinctShops =
      await this.databaseService.inventory.shop_item_weighted_price.findMany({
        distinct: ['shop_id'],
        select: {
          shop_id: true,
        },
      });

    for (const shop of distinctShops) {
      const countItems = await this.databaseService.inventory.$queryRaw<
        WeightedPriceItem[]
      >`
    SELECT DISTINCT ON (supplier_item_id) wac.id, supplier_item_id, weighted_price, total_qty
    FROM shop_item_weighted_price wac
    WHERE shop_id = ${shop.shop_id}
    ORDER BY supplier_item_id, created_at;
  `;
    }
  }
}

interface WeightedPriceItem {
  id: string;
  supplier_item_id: string;
  weighted_price: number;
  total_qty: number;
}
