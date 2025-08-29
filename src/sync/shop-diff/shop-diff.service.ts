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
    // let hasMore = true;
    // let pageNo = 1;

    const scm_shops = await this.databaseService.imbasic.scm_shop.findMany({
      include: {
        scm_shop_brand: true,
      },
    });

    return scm_shops.map((shop) => ({
      shop_db_id: shop.id,
      shop_db_name: shop.shop_name,
      shop_db_brand_name: shop.scm_shop_brand.brand_name,
      shop_db_address: shop.address,
      shop_db_tlsc_id: shop.tc_shop_id,
      shop_db_status: shop.status,
    }));

    // const noMatchItems: {
    //   shop_id: string;
    //   shop_name: string;
    //   open_time: string;
    //   brand_name: string;
    //   address: string;
    // }[] = [];
    // while (hasMore) {
    //   const res = await this.basicDataService.getShops(pageNo);
    //   // syncing data
    //   for (const item of res.shopList) {
    //     const { shop_name, open_time, shop_id, brand_name, address } = item;
    //     noMatchItems.push({
    //       shop_id,
    //       shop_name,
    //       open_time,
    //       brand_name,
    //       address,
    //     });
    //   }

    //   // next page
    //   if (res.pageInfo.pageNo < res.pageInfo.pageTotal) {
    //     pageNo++;
    //   } else {
    //     hasMore = false;
    //   }
    //   console.log(`sync page ${pageNo}, total page ${res.pageInfo.pageTotal}`);
    // }
    // return noMatchItems;
  }
}
