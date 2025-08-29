import { Controller, Get } from '@nestjs/common';
import { ChecksService } from './checks.service';

@Controller('checks')
export class ChecksController {
  constructor(private readonly checksService: ChecksService) {}

  @Get('different-orders')
  async checkDifferentOrders() {
    return this.checksService.checkDifferentOrders();
  }

  @Get('daily-report')
  async dailyReport() {
    return this.checksService.dailyReport();
  }

  @Get('pricings')
  async checkPricings() {
    await this.checksService.checkPricings();
    return { message: 'Pricings check completed' };
  }

  @Get('im-scm-sync-pricings')
  async checkImScmSyncPricings() {
    await this.checksService.checkImScmSyncPricings();
    return { message: 'IM SCM sync pricings check completed' };
  }

  @Get('delivery-qty')
  async checkDeliveryQty() {
    return this.checksService.checkDeliveryQty();
  }

  // @Get('receive-qty')
  // async checkReceiveQty() {
  //   await this.checksService.checkReceiveQty();
  //   return { message: 'Receive quantity check completed' };
  // }

  // @Get('final-qty')
  // async checkFinalQty() {
  //   await this.checksService.checkFinalQty();
  //   return { message: 'Final quantity check completed' };
  // }

  // @Get('delivery-time')
  // async checkDeliveryTime() {
  //   await this.checksService.checkDeliveryTime();
  //   return { message: 'Delivery time check completed' };
  // }

  // @Get('receive-time')
  // async checkReceiveTime() {
  //   await this.checksService.checkReceiveTime();
  //   return { message: 'Receive time check completed' };
  // }

  // @Get('calculated-amount')
  // async checkCalculatedAmount() {
  //   await this.checksService.checkCalculatedAmount();
  //   return { message: 'Calculated amount check completed' };
  // }

  // @Get('final-amount')
  // async checkFinalAmount() {
  //   await this.checksService.checkFinalAmount();
  //   return { message: 'Final amount check completed' };
  // }

  // @Get('unreceived-orders')
  // async checkUnreceivedOrders() {
  //   await this.checksService.checkUnreceivedOrders();
  //   return { message: 'Unreceived orders check completed' };
  // }
}
