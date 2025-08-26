import { Controller, Get, Query } from '@nestjs/common';
import { OperationService } from './业务数据.service';

@Controller('tcsl/datatransfer')
export class OperationController {
  constructor(private readonly operationService: OperationService) {}

  @Get('getserialdata')
  async getSerialData(
    @Query('pageNo') pageNo: number,
    @Query('shopId') shopId: number,
    @Query('settleDate') settleDate: string,
  ) {
    return this.operationService.getSerialData(pageNo, shopId, settleDate);
  }
}
