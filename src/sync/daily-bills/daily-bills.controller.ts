import { Controller, Get, Query } from '@nestjs/common';
import { DailyBillsService } from './daily-bills.service';
import { SyncDailyBillsDto } from './dto/sync-daily-billls.dto';

@Controller('sync')
export class DailyBillsController {
  constructor(private readonly dailyBillsService: DailyBillsService) {}

  @Get('daily-bills')
  async syncDailyBills(
    @Query()
    syncDto: SyncDailyBillsDto,
  ) {
    return this.dailyBillsService.syncDailyBills(syncDto);
  }
}
