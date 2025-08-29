import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { BasicDataService } from 'src/tcsl/基础档案/基础档案.service';

@Injectable()
export class FoodItemService {
  constructor(
    private readonly basicDataService: BasicDataService,
    private readonly databaseService: DatabaseService,
  ) {}

  async syncFoodItem() {
    let hasMore = true;
    let pageNo = 1;
    const activeBrannds =
      await this.databaseService.imbasic.scm_shop_brand.findMany({
        where: {
          is_enabled: true,
        },
      });
    const activeBrandsMap = new Map(
      activeBrannds.map((brand) => [brand.tcsl_id, brand]),
    );
    while (hasMore) {
      const res = await this.basicDataService.getitems(pageNo);

      // syncing data
      const syncItems: {
        id: string;
        name: string;
        unit_name: string;
        price: number;
        category_id: string;
        brand_id: number;
        big_pic_url: string;
        is_package: boolean;
        is_enabled: boolean;
        create_date: Date;
      }[] = [];
      for (const item of res.item) {
        const brand = activeBrandsMap.get(item.brand_id);
        if (brand) {
          // console.log(brand, item.item_name);
          // console.log(item);
          const syncData = {
            id: item.item_id,
            name: item.item_name,
            unit_name: item.unit_name,
            price: item.std_price,
            category_id: item.small_class_id,
            brand_id: brand.id,
            big_pic_url: item.big_pic_url,
            is_package: item.is_package,
            is_enabled: item.is_enable,
            create_date: new Date(item.create_time),
          };
          syncItems.push(syncData);
        }
      }

      if (syncItems.length > 0) {
        for (const syncItem of syncItems) {
          // await this.databaseService.imbasic.st_food_item.upsert({
          //   where: {
          //     id: syncItem.id,
          //   },
          //   update: {
          //     ...syncItem,
          //   },
          //   create: {
          //     ...syncItem,
          //   },
          // });
          await this.databaseService.devOrderService.st_food_item.upsert({
            where: {
              id: syncItem.id,
            },
            update: {
              ...syncItem,
            },
            create: {
              ...syncItem,
            },
          });
        }
      }

      // next page
      if (res.pageInfo.pageNo < res.pageInfo.pageTotal) {
        pageNo++;
      } else {
        hasMore = false;
      }
      console.log(`sync page ${pageNo}, total page ${res.pageInfo.pageTotal}`);
    }
    return 'sync end';
  }
}
