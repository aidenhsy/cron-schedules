import { Injectable, Logger, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(`${InventoryService.name}`);
  constructor(private readonly databaseService: DatabaseService) {}

  // @Cron('59 11 * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
  async syncSupplierItems() {
    this.logger.log('starting syncing supplierItems');
    const supplierItems =
      await this.databaseService.procurement.supplier_items.findMany();

    for (const item of supplierItems) {
      await this.databaseService.inventory.supplier_items.upsert({
        where: {
          id: item.id,
        },
        update: {
          ...item,
        },
        create: {
          ...item,
        },
      });
    }
    const genericItems =
      await this.databaseService.procurement.generic_items.findMany();

    for (const item of genericItems) {
      await this.databaseService.inventory.generic_items.upsert({
        where: {
          id: item.id,
        },
        update: {
          ...item,
        },
        create: {
          ...item,
        },
      });
    }
  }

  // @Cron('28 3 * * *', {
  //   timeZone: 'Asia/Shanghai',
  // })
  async syncSupplierOrders() {
    this.logger.log('starting syncing supplierOrders');
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

      for (const finishedOrder of finishedOrders) {
        const { supplier_order_details, ...rest } = finishedOrder;
        await this.databaseService.inventory.supplier_orders.upsert({
          where: {
            id: rest.id,
          },
          update: {
            ...rest,
          },
          create: {
            ...rest,
          },
        });
        for (const supplierOrderDetail of supplier_order_details) {
          await this.databaseService.inventory.supplier_order_details.upsert({
            where: {
              id: supplierOrderDetail.id,
            },
            update: {
              ...supplierOrderDetail,
            },
            create: {
              ...supplierOrderDetail,
            },
          });
        }
      }
    }

    this.logger.log('syncing supplierOrders completed');
  }

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
            supplier_order_details: {
              include: {
                supplier_items: true,
              },
            },
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
                    source_id: supplierOrder.id,
                    source_detail_id: supplierOrderDetail.id,
                    supplier_item_id: supplierOrderDetail.supplier_item_id!,
                    created_at: supplierOrder.receive_time,
                    updated_at: supplierOrder.receive_time,
                    shop_id: supplierOrder.shop_id,
                    type: 'order_in',
                    total_qty: newTotalQty,
                    total_value: newTotalValue,
                    order_to_base_factor: Number(
                      supplierOrderDetail.supplier_items
                        ?.package_unit_to_base_ratio,
                    ),
                  },
                },
              );
            } else {
              await this.databaseService.inventory.shop_item_weighted_price.create(
                {
                  data: {
                    source_id: supplierOrder.id,
                    source_detail_id: supplierOrderDetail.id,
                    supplier_item_id: supplierOrderDetail.supplier_item_id!,
                    created_at: supplierOrder.receive_time,
                    updated_at: supplierOrder.receive_time,
                    shop_id: supplierOrder.shop_id,
                    type: 'order_in',
                    total_qty: supplierOrderDetail.final_qty,
                    total_value:
                      Number(supplierOrderDetail.price) *
                      Number(supplierOrderDetail.final_qty),
                    order_to_base_factor: Number(
                      supplierOrderDetail.supplier_items
                        ?.package_unit_to_base_ratio,
                    ),
                  },
                },
              );
            }
          }
        }
      }
    }
  }

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
      for (const item of countItems) {
        const allItems =
          await this.databaseService.inventory.shop_item_weighted_price.findMany(
            {
              where: {
                shop_id: shop.shop_id,
                supplier_item_id: item.supplier_item_id,
              },
              orderBy: {
                created_at: 'asc',
              },
            },
          );

        const noneNullSourceDetailIds = allItems.filter(
          (i) => i.source_detail_id !== null,
        );
        if (noneNullSourceDetailIds.length > 0) {
          const supplyOrderDetails =
            await this.databaseService.inventory.supplier_order_details.findMany(
              {
                where: {
                  id: {
                    in: noneNullSourceDetailIds.map((i) => i.id),
                  },
                },
              },
            );
        }
      }
    }
  }
}

interface WeightedPriceItem {
  id: string;
  supplier_item_id: string;
  weighted_price: number;
  total_qty: number;
}
