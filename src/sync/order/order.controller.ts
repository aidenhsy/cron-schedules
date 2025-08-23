import { Body, Controller, Post } from '@nestjs/common';
import { OrderService } from './order.service';

@Controller('sync')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('sync-delivery-qty')
  async syncDeliveryQty(@Body('client_order_id') clientOrderId: string[]) {
    return this.orderService.syncDeliveryQty(clientOrderId);
  }
}
