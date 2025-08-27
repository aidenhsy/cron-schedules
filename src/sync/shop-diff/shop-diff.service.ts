import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { BasicDataService } from 'src/tcsl/基础档案/基础档案.service';

@Injectable()
export class ShopDiffService {
  constructor(
    private readonly basicDataService: BasicDataService,
    private readonly databaseService: DatabaseService,
  ) {}

  async getShopDiff() {
    let hasMore = true;
    let pageNo = 1;

    // const activeBrannds =
    //   await this.databaseService.imbasic.scm_shop_brand.findMany({
    //     where: {
    //       is_enabled: true,
    //     },
    //   });
    // const activeBrandsMap = new Map(
    //   activeBrannds.map((brand) => [brand.tcsl_id, brand]),
    // );
    while (hasMore) {
      const res = await this.basicDataService.getShops(pageNo);
      // syncing data
      const noMatchItems: {
        shop_id: string;
        shop_name: string;
        open_time: string;
      }[] = [];

      const notEqualItems: {
        shop_id: string;
        shop_name: string;
        open_time: string;
        tcsl_shop_id: number | null;
      }[] = [];
      for (const item of res.shopList) {
        const { shop_name, open_time, shop_id } = item;
        // if (!shop_id) {
        //   continue;
        // }
        // const shop = await this.databaseService.imbasic.scm_shop.findFirst({
        //   where: {
        //     shop_name,
        //   },
        // });
        // if (!shop) {
        //   noMatchItems.push({
        //     shop_id,
        //     shop_name,
        //     open_time,
        //   });
        //   continue;
        // } else {
        //   if (shop.tc_shop_id !== shop_id) {
        //     notEqualItems.push({
        //       shop_id,
        //       shop_name,
        //       open_time,
        //       tcsl_shop_id: shop.tc_shop_id,
        //     });
        //   }
        // }
      }
      // if (noMatchItems.length > 0) {
      //   // await this.databaseService.imbasic.scm_shop.createMany({
      //   //   data: syncItems,
      //   // });
      //   console.log('noMatchItems', noMatchItems);
      // }
      // if (notEqualItems.length > 0) {
      //   console.log('notEqualItems', notEqualItems);
      // }

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
