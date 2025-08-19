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
      for (const item of res.item) {
        const brand = activeBrandsMap.get(item.brand_id);
        if (brand) {
          console.log(brand, item.item_name);
        }
      }

      // next page
      if (res.pageInfo.pageNo < res.pageInfo.pageTotal) {
        pageNo++;
      } else {
        hasMore = false;
      }
    }
  }
}
