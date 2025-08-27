import { Controller, Get, Query } from '@nestjs/common';
import { BasicDataService } from './基础档案.service';

@Controller('tcsl/datatransfer')
export class BasicDataController {
  constructor(private readonly basicDataService: BasicDataService) {}

  // 品项档案信息
  @Get('getitems')
  async getitems(@Query('pageNo') pageNo: number) {
    return this.basicDataService.getitems(pageNo);
  }

  // 门店档案信息
  @Get('getshops')
  async getShops(@Query('pageNo') pageNo: number) {
    return this.basicDataService.getShops(pageNo);
  }

  // 品项分类信息
  @Get('getitemcategoryinfo')
  async getItemCategoryInfo(@Query('pageNo') pageNo: number) {
    return this.basicDataService.getItemCategoryInfo(pageNo);
  }
}
