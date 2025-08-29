import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { BasicDataService } from 'src/tcsl/基础档案/基础档案.service';

@Injectable()
export class FoodCategoryService {
  constructor(
    private readonly basicDataService: BasicDataService,
    private readonly databaseService: DatabaseService,
  ) {}

  async syncFoodCategory() {
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
      const res = await this.basicDataService.getItemCategoryInfo(pageNo);
      // syncing data
      const syncItems: {
        id: string;
        name: string;
        brand_id?: number | null;
        level: number;
        brand_name: string;
        delflg: number;
        parent_id: string;
      }[] = [];
      for (const item of res.category) {
        const brand = activeBrandsMap.get(item.brand_id);

        const syncData = {
          id: String(item.class_id),
          name: item.class_name,
          brand_id: brand?.id || null,
          level: item.level,
          brand_name: item.brand_name,
          delflg: item.delflg,
          parent_id: String(item.parent_id),
        };
        syncItems.push(syncData);
      }

      if (syncItems.length > 0) {
        for (const syncItem of syncItems) {
          // await this.databaseService.imbasic.st_food_category.upsert({
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
          await this.databaseService.devOrderService.st_food_category.upsert({
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
