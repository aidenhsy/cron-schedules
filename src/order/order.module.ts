import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { DatabaseModule } from 'src/database/database.module';
import { RabbitmqModule } from 'src/rabbitmq/rabbitmq.module';

@Module({
  providers: [OrderService],
  imports: [DatabaseModule, RabbitmqModule],
})
export class OrderModule {}
